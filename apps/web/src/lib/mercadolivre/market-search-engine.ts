import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/mercadolivre/tenant-scope";
import type { MarketSearchItem, MarketplacePlatform } from "@crm/types";

const ML_API_BASE = "https://api.mercadolibre.com";
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas de cache no Supabase (Free Tier friendly)

export type MarketSearchSource =
  | "extension_live"
  | "supabase_cache"
  | "ml_official_api"
  | "ml_catalog_api"
  | "server_scraper"
  | "none";

export function normalizeSearchKey(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeQueryForMlSlug(query: string): string {
  return normalizeSearchKey(query).replace(/\s+/g, "-");
}

function upgradeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  let clean = url.trim();
  if (clean.startsWith("//")) clean = `https:${clean}`;
  if (clean.startsWith("http://")) clean = clean.replace("http://", "https://");
  return clean.replace(/-I\.(jpg|jpeg|webp|png)$/i, "-V.$1");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 7000
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lê snapshot persistido no Supabase (`market_search_snapshots`).
 * Retorna null se expirado ou se a migration ainda não foi aplicada.
 */
export async function readSearchSnapshotFromDb(params: {
  tenantKey: string;
  query: string;
  platform: MarketplacePlatform | "all";
}): Promise<{ items: MarketSearchItem[]; source: MarketSearchSource; fetchedAt: string } | null> {
  try {
    const supabase = createSupabaseAdminClient();
    const normQ = normalizeSearchKey(params.query);
    if (!normQ) return null;

    const platformsToCheck =
      params.platform === "all"
        ? ["all", "mercadolivre"]
        : [params.platform, "all"];

    const { data, error } = await supabase
      .from("market_search_snapshots")
      .select("items, source, fetched_at, expires_at, platform")
      .eq("tenant_key", params.tenantKey)
      .eq("normalized_query", normQ)
      .in("platform", platformsToCheck)
      .gt("expires_at", new Date().toISOString())
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (!isMissingTableError(error)) {
        console.warn("[MarketSearch] Erro ao ler snapshot:", error.message);
      }
      return null;
    }

    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      return null;
    }

    const items = (data.items as MarketSearchItem[]).filter((it) =>
      params.platform === "all" ? true : it.platform === params.platform
    );

    if (items.length === 0) return null;

    return {
      items,
      source:
        data.source === "extension_live" ? "extension_live" : "supabase_cache",
      fetchedAt: String(data.fetched_at),
    };
  } catch {
    return null;
  }
}

/**
 * Salva/atualiza snapshot no Supabase com TTL de 6 horas.
 */
export async function saveSearchSnapshotToDb(params: {
  organizationId: string | null;
  userId: string | null;
  tenantKey: string;
  query: string;
  platform: MarketplacePlatform | "all";
  source: MarketSearchSource;
  items: MarketSearchItem[];
}): Promise<void> {
  if (!params.items || params.items.length === 0) return;
  try {
    const supabase = createSupabaseAdminClient();
    const normQ = normalizeSearchKey(params.query);
    if (!normQ) return;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SNAPSHOT_TTL_MS);

    const { error } = await supabase
      .from("market_search_snapshots")
      .upsert(
        {
          organization_id: params.organizationId,
          user_id: params.userId,
          tenant_key: params.tenantKey,
          platform: params.platform,
          normalized_query: normQ,
          original_query: params.query.trim(),
          source: params.source,
          total_found: params.items.length,
          items: params.items.slice(0, 80),
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        },
        {
          onConflict: "tenant_key, platform, normalized_query",
        }
      );

    if (error && !isMissingTableError(error)) {
      console.warn("[MarketSearch] Aviso ao salvar snapshot:", error.message);
    }
  } catch {
    // Non-blocking
  }
}

/**
 * CAMADA 2A — API Oficial do Mercado Livre: GET /sites/MLB/search
 * Retorna anúncios reais (orgânicos + catálogo), preços, frete, Full/Flex, reputação e vendas.
 */
export async function fetchViaMlSitesSearchApi(params: {
  query: string;
  limit: number;
  sort?: string;
  token?: string | null;
}): Promise<MarketSearchItem[]> {
  const { query, limit, sort, token } = params;
  const mlSort =
    sort === "price_asc"
      ? "price_asc"
      : sort === "price_desc"
      ? "price_desc"
      : "relevance";

  const fetchLimit = Math.min(50, Math.max(limit, 30));
  const url = `${ML_API_BASE}/sites/MLB/search?q=${encodeURIComponent(
    query.trim()
  )}&limit=${fetchLimit}&sort=${mlSort}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "CRM-Marketplaces-ERP/2.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res = await fetchWithTimeout(url, { headers }, 7000);
  // Se o token estiver sem escopo de busca pública e retornar 401/403, tenta sem Authorization
  if ((!res || res.status === 401 || res.status === 403) && token) {
    res = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "CRM-Marketplaces-ERP/2.0",
        },
      },
      6000
    );
  }

  if (!res || !res.ok) return [];

  const data = (await res.json().catch(() => null)) as {
    results?: Array<Record<string, any>>;
  } | null;

  const results = data?.results ?? [];
  if (results.length === 0) return [];

  const items: MarketSearchItem[] = [];
  const seenIds = new Set<string>();

  for (const r of results) {
    const externalId = String(r.id || "").trim();
    if (!externalId || seenIds.has(externalId)) continue;
    const price = Number(r.price || 0);
    if (!Number.isFinite(price) || price <= 0) continue;
    seenIds.add(externalId);

    const originalPriceRaw = r.original_price ? Number(r.original_price) : null;
    const originalPrice =
      originalPriceRaw && originalPriceRaw > price ? originalPriceRaw : null;
    const discountPct =
      originalPrice && originalPrice > price
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : null;

    const logisticType = String(r.shipping?.logistic_type || "").toLowerCase();
    const isFull = logisticType === "fulfillment";
    const isFlex = logisticType === "self_service";
    const isFree = Boolean(r.shipping?.free_shipping);

    const tags: string[] = Array.isArray(r.tags) ? r.tags : [];
    const promoBadge = discountPct
      ? `${discountPct}% OFF`
      : tags.includes("deal_of_the_day")
      ? "OFERTA DO DIA"
      : tags.includes("lightning_deal")
      ? "OFERTA RELÂMPAGO"
      : isFull
      ? "FULL"
      : null;

    const sellerNick =
      r.seller?.nickname ||
      (r.official_store_name ? String(r.official_store_name) : "Vendedor Mercado Livre");
    const sellerRep =
      r.seller?.seller_reputation?.power_seller_status ||
      (r.official_store_id ? "oficial" : "comum");

    const soldQty = Number(r.sold_quantity || 0);
    const reviewsAvg = Number(r.reviews?.rating_average || 0);
    const reviewsTotal = Number(r.reviews?.total || 0);

    items.push({
      id: externalId,
      platform: "mercadolivre",
      external_id: externalId,
      title: String(r.title || query),
      current_price: Number(price.toFixed(2)),
      original_price: originalPrice ? Number(originalPrice.toFixed(2)) : null,
      discount_pct: discountPct,
      shipping_type: isFull
        ? "ml_full"
        : isFlex
        ? "ml_flex"
        : isFree
        ? "ml_correios"
        : "padrao",
      is_free_shipping: isFree,
      is_full_or_flex: isFull || isFlex,
      promo_badge: promoBadge,
      campaign_type:
        discountPct || tags.includes("deal_of_the_day")
          ? "Campanha Mercado Livre"
          : isFull
          ? "Mercado Envios Full"
          : null,
      listing_type: String(r.listing_type_id || "gold_special"),
      permalink: String(
        r.permalink ||
          `https://produto.mercadolivre.com.br/MLB-${externalId.replace(/^MLB-?/i, "")}`
      ),
      thumbnail_url: upgradeThumbnail(r.thumbnail),
      seller_name: String(sellerNick),
      seller_reputation: sellerRep ? String(sellerRep) : null,
      sales_count_approx: soldQty,
      rating: reviewsAvg > 0 ? Number(reviewsAvg.toFixed(1)) : 4.8,
      reviews_count: reviewsTotal,
      is_already_monitored: false,
      matched_my_listing_id: null,
    });
  }

  return items;
}

/**
 * CAMADA 2B — API Oficial de Catálogo (/products/search + /products/{id}/items)
 * Usada como complemento quando /sites/MLB/search não retornar resultados.
 */
export async function fetchViaMlCatalogApi(
  query: string,
  limit: number,
  token: string
): Promise<MarketSearchItem[]> {
  try {
    const searchRes = await fetchWithTimeout(
      `${ML_API_BASE}/products/search?status=active&site_id=MLB&q=${encodeURIComponent(
        query
      )}&limit=8`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "CRM-Marketplaces-ERP/2.0",
          Accept: "application/json",
        },
      },
      6500
    );

    if (!searchRes || !searchRes.ok) return [];
    const searchData = (await searchRes.json().catch(() => null)) as {
      results?: Array<Record<string, any>>;
    } | null;
    const products = searchData?.results ?? [];
    if (products.length === 0) return [];

    const nested = await Promise.all(
      products.slice(0, 6).map(async (p) => {
        const r = await fetchWithTimeout(
          `${ML_API_BASE}/products/${p.id}/items?limit=15`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": "CRM-Marketplaces-ERP/2.0",
              Accept: "application/json",
            },
          },
          5500
        );
        if (!r || !r.ok) return [];
        const d = (await r.json().catch(() => null)) as {
          results?: Array<Record<string, any>>;
        } | null;
        return (d?.results ?? []).map((it) => ({
          ...it,
          product_name: p.name || query,
          product_picture: p.pictures?.[0]?.url || null,
        }));
      })
    );

    const rawListings: Array<Record<string, any>> = nested.flat();
    if (rawListings.length === 0) return [];

    const uniqueSellerIds = Array.from(
      new Set(rawListings.map((it) => it.seller_id).filter(Boolean))
    ).slice(0, 12);
    const sellerMap = new Map<
      string,
      { nickname: string; power_seller_status: string | null; sales: number }
    >();

    await Promise.all(
      uniqueSellerIds.map(async (sId) => {
        const uRes = await fetchWithTimeout(
          `${ML_API_BASE}/users/${sId}`,
          { headers: { Authorization: `Bearer ${token}` } },
          4000
        );
        if (uRes && uRes.ok) {
          const uData = (await uRes.json().catch(() => null)) as Record<string, any> | null;
          if (uData) {
            sellerMap.set(String(sId), {
              nickname: String(uData.nickname || `Vendedor ${sId}`),
              power_seller_status: uData.seller_reputation?.power_seller_status || null,
              sales: Number(uData.seller_reputation?.transactions?.completed || 0),
            });
          }
        }
      })
    );

    const items: MarketSearchItem[] = [];
    const seen = new Set<string>();

    for (const it of rawListings) {
      if (items.length >= limit) break;
      const externalId = String(it.item_id || "").trim();
      if (!externalId || seen.has(externalId)) continue;
      const price = Number(it.price || 0);
      if (!Number.isFinite(price) || price <= 0) continue;
      seen.add(externalId);

      const seller = sellerMap.get(String(it.seller_id)) || {
        nickname: "Vendedor Mercado Livre",
        power_seller_status: null,
        sales: 0,
      };
      const isFull = it.shipping?.logistic_type === "fulfillment";
      const isFlex = it.shipping?.logistic_type === "self_service";
      const isFree = Boolean(it.shipping?.free_shipping);
      const originalPriceRaw = it.original_price ? Number(it.original_price) : null;
      const originalPrice =
        originalPriceRaw && originalPriceRaw > price ? originalPriceRaw : null;
      const discountPct =
        originalPrice && originalPrice > price
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : null;

      items.push({
        id: externalId,
        platform: "mercadolivre",
        external_id: externalId,
        title: String(it.product_name || query),
        current_price: Number(price.toFixed(2)),
        original_price: originalPrice ? Number(originalPrice.toFixed(2)) : null,
        discount_pct: discountPct,
        shipping_type: isFull
          ? "ml_full"
          : isFlex
          ? "ml_flex"
          : isFree
          ? "ml_correios"
          : "padrao",
        is_free_shipping: isFree,
        is_full_or_flex: isFull || isFlex,
        promo_badge: discountPct ? `${discountPct}% OFF` : isFull ? "FULL" : null,
        campaign_type: isFull ? "Mercado Envios Full" : discountPct ? "Campanha ML" : null,
        listing_type: String(it.listing_type_id || "gold_special"),
        permalink: `https://produto.mercadolivre.com.br/MLB-${externalId.replace(/^MLB-?/i, "")}`,
        thumbnail_url: upgradeThumbnail(it.product_picture),
        seller_name: seller.nickname,
        seller_reputation: seller.power_seller_status,
        sales_count_approx: seller.sales,
        rating: 4.8,
        reviews_count: 0,
        is_already_monitored: false,
        matched_my_listing_id: null,
      });
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Extrai resultados do JSON __PRELOADED_STATE__ embutido no HTML do Mercado Livre.
 */
function parsePreloadedStateFromHtml(html: string, maxItems: number): MarketSearchItem[] {
  const items: MarketSearchItem[] = [];
  const seen = new Set<string>();

  try {
    const stateMatch =
      html.match(/<script[^>]*id=["']__PRELOADED_STATE__["'][^>]*>([\s\S]*?)<\/script>/i) ||
      html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);

    if (!stateMatch || !stateMatch[1]) return [];
    const parsed = JSON.parse(stateMatch[1].trim());
    const results: any[] =
      parsed?.pageState?.initialState?.results ||
      parsed?.initialState?.results ||
      parsed?.results ||
      [];

    if (!Array.isArray(results) || results.length === 0) return [];

    for (const r of results) {
      if (items.length >= maxItems) break;
      const poly = r?.polycard || r;
      const meta = poly?.metadata || {};
      const components: any[] = Array.isArray(poly?.components) ? poly.components : [];

      const externalId = String(meta.id || r.id || "").trim();
      if (!externalId || seen.has(externalId)) continue;

      const titleComp = components.find((c) => c.type === "title");
      const priceComp = components.find((c) => c.type === "price");
      const shippingComp = components.find((c) => c.type === "shipping");
      const sellerComp = components.find((c) => c.type === "seller");
      const reviewsComp = components.find((c) => c.type === "reviews");

      const title = String(titleComp?.title?.text || r.title || "").trim();
      const price = Number(
        priceComp?.price?.current_price?.value ?? r.price ?? 0
      );
      if (!title || !Number.isFinite(price) || price <= 0) continue;

      seen.add(externalId);

      const prevPriceRaw = priceComp?.price?.previous_price?.value
        ? Number(priceComp.price.previous_price.value)
        : null;
      const originalPrice =
        prevPriceRaw && prevPriceRaw > price ? prevPriceRaw : null;
      const discountPct =
        priceComp?.price?.discount?.value
          ? Number(priceComp.price.discount.value)
          : originalPrice
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : null;

      const shipText = String(shippingComp?.shipping?.text || "").toLowerCase();
      const isFull =
        Boolean(shippingComp?.shipping?.promise_type === "same_day") ||
        shipText.includes("full") ||
        JSON.stringify(shippingComp || {}).toLowerCase().includes("poly_full");
      const isFree =
        shipText.includes("grátis") || shipText.includes("gratis");

      const rawUrl = String(meta.url || r.permalink || "");
      const permalink = rawUrl
        ? rawUrl.startsWith("http")
          ? rawUrl
          : `https://${rawUrl.replace(/^\/+/, "")}`
        : `https://produto.mercadolivre.com.br/MLB-${externalId.replace(/^MLB-?/i, "")}`;

      const picId = poly?.pictures?.pictures?.[0]?.id;
      const thumbnail = picId
        ? `https://http2.mlstatic.com/D_NQ_NP_${picId}-V.webp`
        : upgradeThumbnail(r.thumbnail);

      const sellerText = String(sellerComp?.seller?.text || "")
        .replace(/^Por\s+/i, "")
        .replace(/\{icon_cockade\}/g, "")
        .trim();

      const ratingVal = Number(reviewsComp?.reviews?.rating_average || 4.8);
      const reviewsTotal = Number(reviewsComp?.reviews?.total || 0);

      items.push({
        id: externalId,
        platform: "mercadolivre",
        external_id: externalId,
        title,
        current_price: Number(price.toFixed(2)),
        original_price: originalPrice ? Number(originalPrice.toFixed(2)) : null,
        discount_pct: discountPct,
        shipping_type: isFull ? "ml_full" : isFree ? "ml_correios" : "padrao",
        is_free_shipping: isFree,
        is_full_or_flex: isFull,
        promo_badge: discountPct ? `${discountPct}% OFF` : isFull ? "FULL" : null,
        campaign_type: discountPct ? "Campanha Mercado Livre" : isFull ? "Full" : null,
        listing_type: isFull ? "gold_pro" : "gold_special",
        permalink: permalink.split("#")[0],
        thumbnail_url: thumbnail,
        seller_name: sellerText || "Vendedor Mercado Livre",
        seller_reputation: sellerText ? "platinum" : null,
        sales_count_approx: 0,
        rating: Number.isFinite(ratingVal) && ratingVal > 0 ? ratingVal : 4.8,
        reviews_count: Number.isFinite(reviewsTotal) ? reviewsTotal : 0,
        is_already_monitored: false,
        matched_my_listing_id: null,
      });
    }
  } catch {
    // Fallback para outros parsers
  }

  return items;
}

/**
 * Extrai resultados via Schema.org JSON-LD (ItemList / Product)
 */
function parseJsonLdListFromHtml(html: string, maxItems: number): MarketSearchItem[] {
  const items: MarketSearchItem[] = [];
  const seen = new Set<string>();
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null && items.length < maxItems) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const graph: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
        ? parsed["@graph"]
        : [parsed];

      for (const node of graph) {
        const list =
          node?.["@type"] === "ItemList" && Array.isArray(node.itemListElement)
            ? node.itemListElement.map((e: any) => e.item || e)
            : node?.["@type"] === "Product"
            ? [node]
            : [];

        for (const prod of list) {
          if (items.length >= maxItems) break;
          const title = String(prod?.name || "").trim();
          const offer = Array.isArray(prod?.offers) ? prod.offers[0] : prod?.offers;
          const price = Number(offer?.price || 0);
          const url = String(prod?.url || offer?.url || "").split("#")[0];
          if (!title || !price || !url) continue;

          const idMatch = url.match(/(MLB-?\d+)/i);
          const externalId = idMatch
            ? idMatch[1].replace("-", "").toUpperCase()
            : `MLB_${items.length}_${Date.now()}`;
          if (seen.has(externalId)) continue;
          seen.add(externalId);

          items.push({
            id: externalId,
            platform: "mercadolivre",
            external_id: externalId,
            title,
            current_price: Number(price.toFixed(2)),
            original_price: null,
            discount_pct: null,
            shipping_type: "padrao",
            is_free_shipping: false,
            is_full_or_flex: false,
            promo_badge: null,
            campaign_type: null,
            listing_type: "gold_special",
            permalink: url,
            thumbnail_url: upgradeThumbnail(
              Array.isArray(prod.image) ? prod.image[0] : prod.image
            ),
            seller_name: String(offer?.seller?.name || "Vendedor Mercado Livre"),
            seller_reputation: null,
            sales_count_approx: 0,
            rating: Number(prod?.aggregateRating?.ratingValue || 4.8),
            reviews_count: Number(prod?.aggregateRating?.reviewCount || 0),
            is_already_monitored: false,
            matched_my_listing_id: null,
          });
        }
      }
    } catch {
      // ignora bloco inválido
    }
  }

  return items;
}

/**
 * CAMADA 3 — Scraper Estruturado Server-Side (Headers realistas + JSON __PRELOADED_STATE__ + LD+JSON)
 */
export async function fetchViaMlStructuredScraper(
  query: string,
  maxItems: number
): Promise<MarketSearchItem[]> {
  const slug = normalizeQueryForMlSlug(query);
  if (!slug) return [];

  const pageUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;
  const res = await fetchWithTimeout(
    pageUrl,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    },
    7500
  );

  if (!res || !res.ok) return [];
  const html = await res.text();
  if (!html || html.length < 1500) return [];

  // 1. Parser estruturado __PRELOADED_STATE__ (mais completo e confiável)
  const preloadedItems = parsePreloadedStateFromHtml(html, maxItems);
  if (preloadedItems.length > 0) return preloadedItems;

  // 2. Parser Schema.org LD+JSON
  const ldItems = parseJsonLdListFromHtml(html, maxItems);
  if (ldItems.length > 0) return ldItems;

  return [];
}

/**
 * Sugere pareamento com um anúncio próprio usando similaridade léxica de título + faixa de preço.
 */
export function matchMyListingBySimilarity(
  item: Pick<MarketSearchItem, "title" | "current_price" | "platform">,
  myListings: Array<{ id: string; title: string; current_price: number; platform: string }>
): string | null {
  if (!myListings || myListings.length === 0) return null;

  const itemTokens = new Set(
    normalizeSearchKey(item.title)
      .split(" ")
      .filter((t) => t.length >= 3)
  );
  if (itemTokens.size === 0) return null;

  let bestId: string | null = null;
  let bestScore = 0;

  for (const mine of myListings) {
    if (mine.platform && mine.platform !== item.platform) continue;
    const myTokens = normalizeSearchKey(mine.title)
      .split(" ")
      .filter((t) => t.length >= 3);
    if (myTokens.length === 0) continue;

    let overlap = 0;
    for (const t of myTokens) {
      if (itemTokens.has(t)) overlap += 1;
    }

    const jaccard = overlap / Math.max(itemTokens.size, myTokens.length);
    const priceRatio =
      item.current_price > 0
        ? Math.abs(mine.current_price - item.current_price) / item.current_price
        : 1;

    const score = jaccard + (priceRatio < 0.3 ? 0.15 : 0);
    if (overlap >= 2 && score > bestScore && score >= 0.35) {
      bestScore = score;
      bestId = mine.id;
    }
  }

  return bestId;
}
