import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BiComparativeResponse,
  ComparativeListingGroup,
  CompetitorComparisonItem,
  CompetitivenessStatus,
  MarketplacePlatform,
} from "@crm/types";
import {
  cleanPromoBadge,
  cleanSellerName,
  encodeCompetitorMetaInPermalink,
  estimateCompetitorFeesAndShipping,
  estimateMlCreationDate,
  extractCompetitorMetaFromPermalink,
  extractMlbId,
  extractMlbuId,
  normalizeCompetitorPermalink,
  parseCompetitorHtml,
  parsePrice,
  resolveAnyActiveMlToken,
  type VerifiedCompetitorData,
} from "@/lib/services/competitorScraper";

const ML_API_BASE = "https://api.mercadolibre.com";
const MULTIGET_CHUNK_SIZE = 20;
const MAX_CONCURRENCY = 5;

export type RadarSyncScope = "monitored" | "all";

export interface RadarSyncStats {
  myListingsChecked: number;
  myListingsChanged: number;
  competitorsChecked: number;
  competitorsChanged: number;
  followedStoresSynced: number;
  priceDropsDetected: number;
  priceIncreasesDetected: number;
  changedIds: string[];
  sourcesUsed: Record<string, number>;
  syncedAt: string;
  durationMs: number;
}

type DbRow = Record<string, any>;

const STATUS_ORDER: Record<CompetitivenessStatus, number> = {
  LOSING: 0,
  TIED: 1,
  WINNING: 2,
  UNMATCHED: 4,
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

async function fetchJsonWithTimeout<T = any>(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 5000
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CRM-Marketplaces-ERP/2.0",
        ...headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extração limpa e estruturada de página pública do concorrente (JSON-LD + OpenGraph + Preloaded State + DOM Andes).
 * Sem loops excessivos de User-Agents e sem resolução de challenge anti-bot, protegendo o tempo de CPU na Vercel.
 */
export async function scrapeCompetitorCleanStructured(
  rawUrl: string,
  externalId?: string | null
): Promise<Partial<VerifiedCompetitorData> | null> {
  const urlsToTry: string[] = [];
  const normalized = normalizeCompetitorPermalink(rawUrl, externalId);
  if (normalized) urlsToTry.push(normalized);

  const mlbId = extractMlbId(externalId) || extractMlbId(rawUrl);
  if (mlbId) {
    const canonical = `https://produto.mercadolivre.com.br/MLB-${mlbId.replace(/^MLB-?/i, "")}`;
    if (!urlsToTry.includes(canonical)) urlsToTry.push(canonical);
  }

  let bestPartial: Partial<VerifiedCompetitorData> = {};

  for (const targetUrl of urlsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const html = await res.text();
      const extracted = parseCompetitorHtml(html, targetUrl);
      bestPartial = {
        ...bestPartial,
        ...Object.fromEntries(
          Object.entries(extracted).filter(([_, v]) => v !== undefined && v !== null && v !== "")
        ),
      };

      if (bestPartial.current_price && bestPartial.current_price > 0) {
        return { ...bestPartial, source: "html_scraper" };
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return Object.keys(bestPartial).length > 0 ? { ...bestPartial, source: "html_scraper" } : null;
}

function mapMlShippingType(logisticType?: string | null, freeShipping?: boolean): string {
  if (logisticType === "fulfillment") return "ml_full";
  if (logisticType === "self_service") return "ml_flex";
  if (logisticType === "cross_docking" || logisticType === "xd_drop_off") return "ml_coleta";
  if (freeShipping) return "ml_correios";
  return "padrao";
}

function mapMlListingTypeForOwn(listingTypeId?: string | null): string {
  if (listingTypeId === "gold_pro") return "premium";
  if (listingTypeId === "gold_special") return "classico";
  return listingTypeId || "classico";
}

/**
 * Consulta em lote até 20 itens por requisição na API Oficial do Mercado Livre (`/items?ids=...`).
 * Se algum ID retornar 403/401 com token OAuth (comum em itens de terceiros sob PolicyAgent),
 * faz fallback automático sem header Authorization apenas para os IDs pendentes.
 */
async function fetchMlItemsMultigetBatch(
  mlbIds: string[],
  accessToken: string | null
): Promise<Map<string, DbRow>> {
  const itemMap = new Map<string, DbRow>();
  const uniqueIds = Array.from(
    new Set(
      mlbIds
        .map((id) => extractMlbId(id))
        .filter((id): id is string => Boolean(id))
    )
  );
  if (uniqueIds.length === 0) return itemMap;

  const chunks = chunkArray(uniqueIds, MULTIGET_CHUNK_SIZE);

  await runWithConcurrency(chunks, 3, async (chunk) => {
    const idsParam = chunk.join(",");
    const authHeaders: Record<string, string> = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};

    const firstRes = await fetchJsonWithTimeout<any[]>(
      `${ML_API_BASE}/items?ids=${idsParam}`,
      authHeaders,
      5500
    );

    const retryIds: string[] = [];
    if (firstRes.ok && Array.isArray(firstRes.data)) {
      for (const entry of firstRes.data) {
        if (entry?.code === 200 && entry.body?.id) {
          itemMap.set(String(entry.body.id).toUpperCase(), entry.body);
        } else if (accessToken && entry?.body?.id) {
          retryIds.push(String(entry.body.id).toUpperCase());
        }
      }
    } else if (accessToken) {
      retryIds.push(...chunk);
    }

    // Fallback público sem Authorization para itens de terceiros bloqueados por escopo do token
    const missingFromChunk = chunk.filter((id) => !itemMap.has(id.toUpperCase()));
    const toRetryPublic = Array.from(new Set([...retryIds, ...missingFromChunk]));

    if (accessToken && toRetryPublic.length > 0) {
      const pubRes = await fetchJsonWithTimeout<any[]>(
        `${ML_API_BASE}/items?ids=${toRetryPublic.join(",")}`,
        {},
        5000
      );
      if (pubRes.ok && Array.isArray(pubRes.data)) {
        for (const entry of pubRes.data) {
          if (entry?.code === 200 && entry.body?.id) {
            itemMap.set(String(entry.body.id).toUpperCase(), entry.body);
          }
        }
      }
    }
  });

  return itemMap;
}

/**
 * Consulta em lote perfis de vendedores no Mercado Livre (`/users?ids=...`, até 20 por chamada).
 */
async function fetchMlSellersMultigetBatch(
  sellerIds: Array<string | number>,
  accessToken: string | null
): Promise<Map<string, { nickname: string; reputation: string }>> {
  const sellerMap = new Map<string, { nickname: string; reputation: string }>();
  const uniqueIds = Array.from(
    new Set(
      sellerIds
        .map((s) => String(s || "").trim())
        .filter((s) => /^\d+$/.test(s))
    )
  );
  if (uniqueIds.length === 0) return sellerMap;

  const chunks = chunkArray(uniqueIds, MULTIGET_CHUNK_SIZE);
  const headers: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  await runWithConcurrency(chunks, 3, async (chunk) => {
    const res = await fetchJsonWithTimeout<any[]>(
      `${ML_API_BASE}/users?ids=${chunk.join(",")}`,
      headers,
      4500
    );
    if (res.ok && Array.isArray(res.data)) {
      for (const entry of res.data) {
        const body = entry?.code === 200 ? entry.body : entry?.id ? entry : null;
        if (body?.id) {
          const nickname = cleanSellerName(body.eshop?.eshop_nome || body.nickname);
          const power = String(body.seller_reputation?.power_seller_status || "").toLowerCase();
          const reputation =
            power === "platinum" || power === "gold"
              ? power
              : body.tags?.includes("brand")
              ? "oficial"
              : "comum";
          sellerMap.set(String(body.id), { nickname, reputation });
        }
      }
    }
  });

  return sellerMap;
}

/**
 * Resolve o preço promocional real vigente de um anúncio próprio no Mercado Livre.
 */
async function resolveOwnListingLivePromoPrice(
  mlbId: string,
  itemBody: DbRow | undefined,
  fallbackCurrentPrice: number,
  fallbackOriginalPrice: number | null,
  accessToken: string
): Promise<{ currentPrice: number; originalPrice: number | null }> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const basePrice = Number(itemBody?.price || fallbackCurrentPrice || 0);
  let currentPrice = basePrice;
  let originalPrice: number | null =
    itemBody?.original_price && Number(itemBody.original_price) > basePrice
      ? Number(itemBody.original_price)
      : fallbackOriginalPrice && fallbackOriginalPrice > basePrice
      ? fallbackOriginalPrice
      : null;

  const [salePriceRes, promoRes] = await Promise.all([
    fetchJsonWithTimeout<any>(
      `${ML_API_BASE}/items/${mlbId}/sale_price?context=channel_marketplace`,
      headers,
      4000
    ),
    fetchJsonWithTimeout<any>(
      `${ML_API_BASE}/seller-promotions/items/${mlbId}?app_version=v2`,
      headers,
      4000
    ),
  ]);

  if (salePriceRes.ok && salePriceRes.data && Number(salePriceRes.data.amount) > 0) {
    currentPrice = Number(salePriceRes.data.amount);
    const reg = Number(salePriceRes.data.regular_amount || 0);
    if (reg > currentPrice) originalPrice = reg;
    else if (basePrice > currentPrice) originalPrice = basePrice;
  }

  if (promoRes.ok && promoRes.data) {
    const promoList = (
      Array.isArray(promoRes.data) ? promoRes.data : promoRes.data.results || []
    ) as DbRow[];
    const activePromos = promoList.filter(
      (p) =>
        (p.status === "started" || p.status === "active") &&
        Number(p.price ?? p.deal_price ?? p.top_deal_price ?? 0) > 0
    );
    if (activePromos.length > 0) {
      activePromos.sort(
        (a, b) =>
          Number(a.price ?? a.deal_price ?? a.top_deal_price) -
          Number(b.price ?? b.deal_price ?? b.top_deal_price)
      );
      const bestPrice = Number(
        activePromos[0].price ?? activePromos[0].deal_price ?? activePromos[0].top_deal_price
      );
      if (bestPrice > 0 && (currentPrice <= 0 || bestPrice <= currentPrice)) {
        currentPrice = bestPrice;
        const origCandidates = activePromos
          .map((p) => Number(p.original_price || 0))
          .filter((op) => op > currentPrice);
        if (origCandidates.length > 0) {
          originalPrice = Math.max(...origCandidates);
        } else if (basePrice > currentPrice) {
          originalPrice = basePrice;
        }
      }
    }
  }

  if (originalPrice !== null && originalPrice <= currentPrice) {
    originalPrice = null;
  }

  return { currentPrice, originalPrice };
}

/**
 * Busca enriquecimento de concorrente via API de Busca/Catálogo do Mercado Livre quando `/items` não retorna preço promocional completo.
 */
async function resolveCompetitorViaMlSearchOrCatalog(params: {
  mlbId: string | null;
  mlbuId: string | null;
  title: string;
  sellerName: string | null;
  accessToken: string | null;
}): Promise<Partial<VerifiedCompetitorData> | null> {
  const { mlbId, mlbuId, title, sellerName, accessToken } = params;
  const headers: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  // 1. Se for User Product (MLBU), tenta resolver o item subjacente
  if (mlbuId && accessToken) {
    const upRes = await fetchJsonWithTimeout<any>(
      `${ML_API_BASE}/user-products/${mlbuId}/items`,
      headers,
      4000
    );
    const firstId = upRes.data?.results?.[0]?.id || upRes.data?.results?.[0];
    if (typeof firstId === "string" && firstId.startsWith("MLB")) {
      const itemMap = await fetchMlItemsMultigetBatch([firstId], accessToken);
      const body = itemMap.get(firstId.toUpperCase());
      if (body && Number(body.price) > 0) {
        return {
          title: body.title,
          current_price: Number(body.price),
          original_price:
            body.original_price && Number(body.original_price) > Number(body.price)
              ? Number(body.original_price)
              : null,
          shipping_type: mapMlShippingType(body.shipping?.logistic_type, body.shipping?.free_shipping),
          thumbnail_url: body.thumbnail ? String(body.thumbnail).replace("http://", "https://") : null,
          sales_count_approx: Number(body.sold_quantity || 0),
          listing_type: body.listing_type_id || undefined,
          external_id: body.id,
          permalink: body.permalink,
          source: "ml_api",
        };
      }
    }
  }

  // 2. Busca por título no /sites/MLB/search filtrando pelo ID exato do anúncio concorrente
  const cleanTitle = String(title || "").trim().slice(0, 65);
  if (!cleanTitle) return null;

  const searchRes = await fetchJsonWithTimeout<any>(
    `${ML_API_BASE}/sites/MLB/search?q=${encodeURIComponent(cleanTitle)}&limit=25`,
    headers,
    4500
  );

  const results: DbRow[] = Array.isArray(searchRes.data?.results)
    ? searchRes.data.results
    : [];

  if (results.length > 0) {
    const normSeller = sellerName ? cleanSellerName(sellerName).toLowerCase() : "";
    const matched =
      results.find((r) => mlbId && String(r.id).toUpperCase() === mlbId.toUpperCase()) ||
      (normSeller && normSeller !== "concorrente"
        ? results.find(
            (r) =>
              cleanSellerName(r.seller?.nickname || "").toLowerCase() === normSeller &&
              r.title?.toLowerCase().slice(0, 25) === cleanTitle.toLowerCase().slice(0, 25)
          )
        : null);

    if (matched && Number(matched.price) > 0) {
      const price = Number(matched.price);
      const orig =
        matched.original_price && Number(matched.original_price) > price
          ? Number(matched.original_price)
          : null;
      return {
        title: matched.title,
        current_price: price,
        original_price: orig,
        seller_name: matched.seller?.nickname ? cleanSellerName(matched.seller.nickname) : undefined,
        shipping_type: mapMlShippingType(
          matched.shipping?.logistic_type,
          matched.shipping?.free_shipping
        ),
        promo_badge: cleanPromoBadge(null, price, orig),
        thumbnail_url: matched.thumbnail
          ? String(matched.thumbnail).replace("http://", "https://").replace(/-I\./, "-V.")
          : null,
        sales_count_approx:
          matched.sold_quantity !== undefined ? Number(matched.sold_quantity) : undefined,
        listing_type: matched.listing_type_id || undefined,
        permalink: matched.permalink || undefined,
        external_id: matched.id || mlbId || undefined,
        source: "ml_api",
      };
    }
  }

  return null;
}

function toCompetitorItem(comp: DbRow, referencePrice: number): CompetitorComparisonItem {
  const compPrice = Number(comp.current_price);
  const origPrice = comp.original_price ? Number(comp.original_price) : null;
  const diffBrl = referencePrice - compPrice;
  const diffPct = compPrice > 0 ? (diffBrl / compPrice) * 100 : 0;

  const estCreatedAt = estimateMlCreationDate(comp.external_id, comp.thumbnail_url);
  let resolvedCreatedAt = comp.listing_created_at || estCreatedAt || comp.created_at || null;
  if (comp.listing_created_at && estCreatedAt) {
    const dbTime = new Date(comp.listing_created_at).getTime();
    const estTime = new Date(estCreatedAt).getTime();
    if (!isNaN(dbTime) && !isNaN(estTime) && dbTime > estTime + 45 * 86400000) {
      resolvedCreatedAt = estCreatedAt;
    }
  }

  const { cleanPermalink, meta } = extractCompetitorMetaFromPermalink(comp.permalink);
  const estFees = estimateCompetitorFeesAndShipping(
    compPrice,
    comp.platform || "mercadolivre",
    meta.listing_type || comp.listing_type,
    comp.external_id
  );

  return {
    id: comp.id,
    external_id: comp.external_id,
    seller_name: cleanSellerName(comp.seller_name),
    seller_reputation: comp.seller_reputation,
    title: comp.title,
    current_price: compPrice,
    original_price: origPrice && origPrice > compPrice ? origPrice : null,
    shipping_type: comp.shipping_type,
    promo_badge: cleanPromoBadge(comp.promo_badge, compPrice, origPrice),
    permalink:
      normalizeCompetitorPermalink(cleanPermalink, comp.external_id, comp.platform) ||
      cleanPermalink,
    thumbnail_url: comp.thumbnail_url,
    price_difference_brl: Number(diffBrl.toFixed(2)),
    price_difference_pct: Number(diffPct.toFixed(2)),
    last_scraped_at: comp.last_scraped_at,
    sales_count_approx: comp.sales_count_approx ?? 0,
    listing_created_at: resolvedCreatedAt,
    created_at: comp.created_at,
    listing_type: meta.listing_type ?? estFees.listing_type,
    sale_fee_amount: meta.sale_fee_amount ?? estFees.sale_fee_amount,
    sale_fee_pct: meta.sale_fee_pct ?? estFees.sale_fee_pct,
    shipping_cost: meta.shipping_cost ?? estFees.shipping_cost,
  };
}

function buildMyListingGroup(item: DbRow, matchedIds: Set<string>): ComparativeListingGroup {
  const myPrice = Number(item.current_price);
  const activeComps: DbRow[] = (item.listing_matches || [])
    .filter((m: DbRow) => m.is_active && m.competitor_listings)
    .map((m: DbRow) => m.competitor_listings);

  activeComps.forEach((c) => matchedIds.add(c.id));
  const competitors = activeComps
    .map((c) => toCompetitorItem(c, myPrice))
    .sort((a, b) => a.current_price - b.current_price);

  const lowestPrice = competitors.length
    ? Math.min(...competitors.map((c) => c.current_price))
    : null;
  let status: CompetitivenessStatus = "UNMATCHED";
  let diffBrl: number | null = null;
  let diffPct: number | null = null;

  if (lowestPrice !== null) {
    diffBrl = Number((myPrice - lowestPrice).toFixed(2));
    diffPct = lowestPrice > 0 ? Number(((diffBrl / lowestPrice).toFixed(4)) as any) * 100 : 0;
    diffPct = Number(diffPct.toFixed(2));
    status = diffBrl < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";
  }

  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  const { listing_matches: _matches, products: _products, ...listing } = item;

  return {
    my_listing: {
      ...(listing as any),
      current_price: myPrice,
      original_price: item.original_price ? Number(item.original_price) : null,
      product_sku: product?.sku || null,
      product_cost_price: product?.cost_price ? Number(product.cost_price) : null,
      sales_count_approx: item.sales_count_approx ?? item.sold_quantity ?? 0,
      listing_created_at:
        item.listing_created_at ||
        item.raw_data?.date_created ||
        item.raw_data?.start_time ||
        estimateMlCreationDate(item.external_id, item.thumbnail_url) ||
        item.created_at ||
        null,
    },
    competitors,
    lowest_competitor_price: lowestPrice,
    diff_brl: diffBrl,
    diff_pct: diffPct,
    status,
  };
}

function buildRadarGroup(comp: DbRow): ComparativeListingGroup {
  const compPrice = Number(comp.current_price);
  const cleanExt = (comp.external_id || "PROD").replace(/[^A-Z0-9]/gi, "").slice(-8);

  return {
    my_listing: {
      id: `radar-${comp.id}`,
      user_id: comp.user_id,
      product_id: null,
      platform: comp.platform,
      external_id: comp.external_id,
      title: `[Radar de Mercado] ${comp.title}`,
      current_price: compPrice,
      original_price: comp.original_price ? Number(comp.original_price) : null,
      permalink: comp.permalink,
      thumbnail_url: comp.thumbnail_url || null,
      shipping_type: comp.shipping_type || "padrao",
      listing_type: "radar",
      status: "active",
      created_at: comp.listing_created_at || comp.created_at,
      updated_at: comp.updated_at,
      product_sku: `RADAR-${cleanExt}`,
      product_cost_price: null,
      sales_count_approx: comp.sales_count_approx ?? 0,
      listing_created_at: comp.listing_created_at || comp.created_at || null,
    } as any,
    competitors: [toCompetitorItem(comp, compPrice)],
    lowest_competitor_price: compPrice,
    diff_brl: 0,
    diff_pct: 0,
    status: "TIED",
  };
}

function sortRank(g: ComparativeListingGroup): number {
  if (g.my_listing.listing_type === "radar") return 3;
  return STATUS_ORDER[g.status] ?? 5;
}

/**
 * Consolida a visão completa do Radar Comparativo em apenas 2 queries paralelas no Supabase.
 */
export async function buildComparativeResponseFromDb(
  supabase: SupabaseClient,
  params: {
    platform: MarketplacePlatform;
    search?: string;
    statusFilter?: string;
    userId?: string | null;
  }
): Promise<BiComparativeResponse> {
  const { platform, search = "", statusFilter = "all", userId } = params;

  let myListingsQuery = supabase
    .from("my_listings")
    .select(
      "*, products ( sku, cost_price ), listing_matches ( is_active, competitor_listings ( * ) )"
    )
    .eq("platform", platform)
    .order("created_at", { ascending: false });

  let competitorsQuery = supabase
    .from("competitor_listings")
    .select("*")
    .eq("platform", platform)
    .order("last_scraped_at", { ascending: false });

  if (userId) {
    myListingsQuery = myListingsQuery.eq("user_id", userId);
    competitorsQuery = competitorsQuery.eq("user_id", userId);
  }

  let [myListingsRes, competitorsRes] = await Promise.all([
    myListingsQuery,
    competitorsQuery,
  ]);

  // Fallback de compatibilidade caso os dados históricos tenham sido gravados sem o userId da sessão atual
  if (
    userId &&
    !myListingsRes.error &&
    !competitorsRes.error &&
    (myListingsRes.data?.length || 0) === 0 &&
    (competitorsRes.data?.length || 0) === 0
  ) {
    [myListingsRes, competitorsRes] = await Promise.all([
      supabase
        .from("my_listings")
        .select(
          "*, products ( sku, cost_price ), listing_matches ( is_active, competitor_listings ( * ) )"
        )
        .eq("platform", platform)
        .order("created_at", { ascending: false }),
      supabase
        .from("competitor_listings")
        .select("*")
        .eq("platform", platform)
        .order("last_scraped_at", { ascending: false }),
    ]);
  }

  if (myListingsRes.error || competitorsRes.error) {
    const dbError = myListingsRes.error || competitorsRes.error;
    throw new Error(dbError?.message || "Falha ao consultar dados do Radar Comparativo.");
  }

  const matchedIds = new Set<string>();
  const listingGroups = (myListingsRes.data || []).map((item) =>
    buildMyListingGroup(item, matchedIds)
  );
  const radarGroups = (competitorsRes.data || [])
    .filter((comp) => !matchedIds.has(comp.id))
    .map(buildRadarGroup);

  const groups = [...listingGroups, ...radarGroups].sort((a, b) => sortRank(a) - sortRank(b));

  let filtered = groups;
  const cleanSearch = search.toLowerCase().trim();

  if (cleanSearch) {
    filtered = filtered.filter((g) => {
      const l = g.my_listing;
      return (
        l.title.toLowerCase().includes(cleanSearch) ||
        (l.product_sku?.toLowerCase().includes(cleanSearch) ?? false) ||
        l.external_id.toLowerCase().includes(cleanSearch) ||
        g.competitors.some(
          (c) =>
            c.title.toLowerCase().includes(cleanSearch) ||
            (c.seller_name || "").toLowerCase().includes(cleanSearch) ||
            c.external_id.toLowerCase().includes(cleanSearch)
        )
      );
    });
  }

  if (statusFilter === "MONITORED" || statusFilter === "PAIRED") {
    filtered = filtered.filter(
      (g) => g.competitors.length > 0 && g.my_listing.listing_type !== "radar"
    );
  } else if (statusFilter !== "all") {
    filtered =
      statusFilter === "RADAR"
        ? filtered.filter((g) => g.my_listing.listing_type === "radar")
        : filtered.filter(
            (g) => g.status === statusFilter && g.my_listing.listing_type !== "radar"
          );
  }

  const isOwn = (g: ComparativeListingGroup) => g.my_listing.listing_type !== "radar";
  const summary = {
    total_listings: groups.length,
    monitored_count: groups.filter((g) => isOwn(g) && g.competitors.length > 0).length,
    winning_count: groups.filter((g) => isOwn(g) && g.status === "WINNING").length,
    tied_count: groups.filter((g) => isOwn(g) && g.status === "TIED").length,
    losing_count: groups.filter((g) => isOwn(g) && g.status === "LOSING").length,
    unmatched_count: groups.filter((g) => isOwn(g) && g.status === "UNMATCHED").length,
    radar_count: radarGroups.length,
  };

  return { platform, summary, items: filtered };
}

/**
 * Motor Unificado de Atualização Manual Sob Demanda (1-Clique) do Radar Comparativo:
 * 1) Sincroniza Meus Anúncios via Multiget (20/req) + Promoções Ativas (/sale_price e /seller-promotions) com escrita delta-only.
 * 2) Sincroniza Concorrentes Pareados + Concorrentes Seguidos (Radar & Lojas Seguidas) via 4 camadas:
 *    Extensão Chrome (IP residencial) -> API Oficial ML Multiget + Sale Price -> Busca/Catálogo ML -> Scraper Estruturado Limpo.
 * 3) Zero polling automático e zero duplicidade em `price_history` (delegado ao trigger nativo do PostgreSQL).
 */
export async function runSmartRadarSync(params: {
  supabase: SupabaseClient;
  userId: string | null;
  organizationId?: string | null;
  platform: MarketplacePlatform;
  scope?: RadarSyncScope;
  myListingIds?: string[];
  verifiedCompetitors?: Record<string, Record<string, any>>;
}): Promise<{
  stats: RadarSyncStats;
  comparative: BiComparativeResponse;
}> {
  const startedAt = Date.now();
  const {
    supabase,
    userId,
    organizationId = null,
    platform,
    scope = "monitored",
    myListingIds,
    verifiedCompetitors = {},
  } = params;

  const nowIso = new Date().toISOString();
  const changedIds = new Set<string>();
  const sourcesUsed: Record<string, number> = {};
  const bumpSource = (src: string) => {
    sourcesUsed[src] = (sourcesUsed[src] || 0) + 1;
  };

  let myListingsChecked = 0;
  let myListingsChanged = 0;
  let competitorsChecked = 0;
  let competitorsChanged = 0;
  let followedStoresSynced = 0;
  let priceDropsDetected = 0;
  let priceIncreasesDetected = 0;

  // 1. Carrega estado atual do banco em paralelo (Meus Anúncios, Vínculos, Concorrentes e Lojas Seguidas)
  let myQuery = supabase
    .from("my_listings")
    .select("id, user_id, platform, external_id, title, current_price, original_price, sold_quantity, available_quantity, shipping_type, listing_type, status, thumbnail_url")
    .eq("platform", platform);

  let matchesQuery = supabase
    .from("listing_matches")
    .select("id, user_id, my_listing_id, competitor_listing_id")
    .eq("is_active", true);

  let compsQuery = supabase
    .from("competitor_listings")
    .select("*")
    .eq("platform", platform);

  let storesQuery = supabase
    .from("competitor_stores")
    .select("id, store_name, seller_id, seller_nickname, seller_reputation, is_following")
    .eq("platform", platform)
    .eq("is_following", true);

  if (userId) {
    myQuery = myQuery.eq("user_id", userId);
    matchesQuery = matchesQuery.eq("user_id", userId);
    compsQuery = compsQuery.eq("user_id", userId);
    storesQuery = storesQuery.eq("user_id", userId);
  }

  let [myRes, matchesRes, compsRes, storesRes] = await Promise.all([
    myQuery,
    matchesQuery,
    compsQuery,
    storesQuery,
  ]);

  // Fallback de compatibilidade se o usuário logado tiver dados sem filtro estrito de user_id legado
  if (
    userId &&
    (myRes.data?.length || 0) === 0 &&
    (compsRes.data?.length || 0) === 0
  ) {
    [myRes, matchesRes, compsRes] = await Promise.all([
      supabase
        .from("my_listings")
        .select("id, user_id, platform, external_id, title, current_price, original_price, sold_quantity, available_quantity, shipping_type, listing_type, status, thumbnail_url")
        .eq("platform", platform),
      supabase
        .from("listing_matches")
        .select("id, user_id, my_listing_id, competitor_listing_id")
        .eq("is_active", true),
      supabase
        .from("competitor_listings")
        .select("*")
        .eq("platform", platform),
    ]);
  }

  const allMyListings: DbRow[] = myRes.data || [];
  const activeMatches: DbRow[] = matchesRes.data || [];
  const allCompetitors: DbRow[] = compsRes.data || [];
  const followedStores: DbRow[] = storesRes.data || [];
  followedStoresSynced = followedStores.length;

  const pairedMyListingIds = new Set<string>(
    activeMatches.map((m) => String(m.my_listing_id)).filter(Boolean)
  );
  const pairedCompetitorIds = new Set<string>(
    activeMatches.map((m) => String(m.competitor_listing_id)).filter(Boolean)
  );

  // Mapa auxiliar de lojas seguidas por nickname normalizado para enriquecer reputação/nome
  const followedStoreByName = new Map<string, DbRow>();
  for (const st of followedStores) {
    if (st.store_name) {
      followedStoreByName.set(cleanSellerName(st.store_name).toLowerCase(), st);
    }
    if (st.seller_nickname) {
      followedStoreByName.set(String(st.seller_nickname).toLowerCase(), st);
    }
  }

  // Resolve token OAuth do Mercado Livre apenas 1 vez para todo o ciclo
  const resolvedOwnerUserId =
    userId || allMyListings[0]?.user_id || allCompetitors[0]?.user_id || null;
  const accessToken =
    platform === "mercadolivre"
      ? await resolveAnyActiveMlToken(resolvedOwnerUserId, organizationId)
      : null;

  // ============================================================================
  // ETAPA A: SINCRONIZAÇÃO EFICIENTE DOS MEUS ANÚNCIOS (ML MULTIGET + PROMOS)
  // ============================================================================
  let targetMyListings = allMyListings;
  if (myListingIds && myListingIds.length > 0) {
    const filterSet = new Set(myListingIds);
    targetMyListings = allMyListings.filter((l) => filterSet.has(l.id));
  } else if (scope === "monitored" && allMyListings.length > 40) {
    // Se o catálogo for grande (>40 itens), no modo econômico sincroniza apenas os monitorados no Radar
    targetMyListings = allMyListings.filter((l) => pairedMyListingIds.has(l.id));
  }

  if (platform === "mercadolivre" && targetMyListings.length > 0 && accessToken) {
    const ownMlbIds = targetMyListings
      .map((l) => extractMlbId(l.external_id))
      .filter((id): id is string => Boolean(id));

    const ownMultigetMap = await fetchMlItemsMultigetBatch(ownMlbIds, accessToken);

    await runWithConcurrency(targetMyListings, MAX_CONCURRENCY, async (own) => {
      const mlbId = extractMlbId(own.external_id);
      if (!mlbId) return;

      myListingsChecked++;
      const itemBody = ownMultigetMap.get(mlbId.toUpperCase());
      const isMonitored = pairedMyListingIds.has(own.id);

      let nextPrice = Number(itemBody?.price ?? own.current_price ?? 0);
      let nextOriginalPrice: number | null =
        itemBody?.original_price && Number(itemBody.original_price) > nextPrice
          ? Number(itemBody.original_price)
          : own.original_price
          ? Number(own.original_price)
          : null;

      // Para todos os meus anúncios monitorados (ou se <= 25 itens), confere promoção ativa real no ML
      if (isMonitored || targetMyListings.length <= 25) {
        const livePromo = await resolveOwnListingLivePromoPrice(
          mlbId,
          itemBody,
          nextPrice,
          nextOriginalPrice,
          accessToken
        );
        nextPrice = livePromo.currentPrice;
        nextOriginalPrice = livePromo.originalPrice;
      }

      const nextSold =
        itemBody?.sold_quantity !== undefined
          ? Math.max(0, Number(itemBody.sold_quantity))
          : Number(own.sold_quantity || 0);
      const nextAvail =
        itemBody?.available_quantity !== undefined
          ? Math.max(0, Number(itemBody.available_quantity))
          : Number(own.available_quantity || 0);
      const nextShipping = itemBody?.shipping
        ? mapMlShippingType(itemBody.shipping.logistic_type, itemBody.shipping.free_shipping)
        : own.shipping_type;
      const nextListingType = itemBody?.listing_type_id
        ? mapMlListingTypeForOwn(itemBody.listing_type_id)
        : own.listing_type;
      const nextThumb =
        itemBody?.pictures?.[0]?.secure_url ||
        (itemBody?.thumbnail ? String(itemBody.thumbnail).replace("http://", "https://") : null) ||
        own.thumbnail_url;
      const nextTitle = itemBody?.title || own.title;

      const priceChanged = Math.abs(nextPrice - Number(own.current_price || 0)) >= 0.01;
      const origChanged =
        (nextOriginalPrice ?? null) !== (own.original_price ? Number(own.original_price) : null);
      const metaChanged =
        nextSold !== Number(own.sold_quantity || 0) ||
        nextAvail !== Number(own.available_quantity || 0) ||
        nextShipping !== own.shipping_type ||
        nextTitle !== own.title;

      // Escrita Delta-Only: só grava no Supabase se algum dado mudou
      if (nextPrice > 0 && (priceChanged || origChanged || metaChanged)) {
        await supabase
          .from("my_listings")
          .update({
            title: nextTitle,
            current_price: nextPrice,
            original_price: nextOriginalPrice,
            sold_quantity: nextSold,
            available_quantity: nextAvail,
            shipping_type: nextShipping,
            listing_type: nextListingType,
            thumbnail_url: nextThumb,
            updated_at: nowIso,
          })
          .eq("id", own.id);

        myListingsChanged++;
        if (priceChanged) changedIds.add(own.id);
      }
    });
  }

  // ============================================================================
  // ETAPA B: SINCRONIZAÇÃO MULTICAMADA DOS CONCORRENTES PAREADOS & SEGUIDOS
  // ============================================================================
  let targetCompetitors = allCompetitors;
  if (myListingIds && myListingIds.length > 0) {
    const allowedMySet = new Set(myListingIds);
    const allowedCompIds = new Set(
      activeMatches
        .filter((m) => allowedMySet.has(String(m.my_listing_id)))
        .map((m) => String(m.competitor_listing_id))
    );
    targetCompetitors = allCompetitors.filter((c) => allowedCompIds.has(c.id));
  } else if (scope === "monitored") {
    // Inclui concorrentes pareados (1:N) + concorrentes seguidos no Radar Comparativo
    targetCompetitors = allCompetitors.filter(
      (c) => pairedCompetitorIds.has(c.id) || Boolean(c.id)
    );
  }

  if (targetCompetitors.length > 0) {
    // Pré-carrega Multiget de todos os concorrentes MLB que ainda não vieram conferidos pela extensão
    const compsNeedingServerFetch = targetCompetitors.filter((c) => {
      const extVerified = verifiedCompetitors[c.id] || verifiedCompetitors[c.external_id];
      return !(extVerified && parsePrice(extVerified.current_price) > 0);
    });

    const compMlbIds =
      platform === "mercadolivre"
        ? compsNeedingServerFetch
            .map(
              (c) =>
                extractMlbId(c.external_id) ||
                extractMlbId(normalizeCompetitorPermalink(c.permalink, c.external_id, c.platform))
            )
            .filter((id): id is string => Boolean(id))
        : [];

    const compMultigetMap =
      compMlbIds.length > 0
        ? await fetchMlItemsMultigetBatch(compMlbIds, accessToken)
        : new Map<string, DbRow>();

    const sellerIdsFromMultiget = Array.from(compMultigetMap.values())
      .map((item) => item?.seller_id)
      .filter(Boolean);

    const sellerMultigetMap =
      sellerIdsFromMultiget.length > 0
        ? await fetchMlSellersMultigetBatch(sellerIdsFromMultiget, accessToken)
        : new Map<string, { nickname: string; reputation: string }>();

    const updatedStoreListingsSync: Array<{
      external_id: string;
      current_price: number;
      original_price: number | null;
      sales_count_approx: number;
      shipping_type: string;
    }> = [];

    await runWithConcurrency(targetCompetitors, MAX_CONCURRENCY, async (comp) => {
      competitorsChecked++;

      const normUrl = normalizeCompetitorPermalink(
        comp.permalink,
        comp.external_id,
        comp.platform
      );
      const mlbId = extractMlbId(comp.external_id) || extractMlbId(normUrl);
      const mlbuId = extractMlbuId(normUrl) || extractMlbuId(comp.external_id);

      let partial: Partial<VerifiedCompetitorData> = {};
      let usedSource = "database_cached";

      // Camada 1: Dados verificados em tempo real pela Extensão Chrome (IP residencial do usuário)
      const extData = verifiedCompetitors[comp.id] || verifiedCompetitors[comp.external_id];
      if (extData && parsePrice(extData.current_price) > 0) {
        const extPrice = parsePrice(extData.current_price);
        const extOrig = extData.original_price ? parsePrice(extData.original_price) : null;
        partial = {
          title: extData.title || undefined,
          current_price: extPrice,
          original_price: extOrig && extOrig > extPrice ? extOrig : null,
          seller_name: extData.seller_name ? cleanSellerName(extData.seller_name) : undefined,
          seller_reputation: extData.seller_reputation || undefined,
          shipping_type: extData.shipping_type || undefined,
          promo_badge: extData.promo_badge || undefined,
          thumbnail_url: extData.thumbnail_url || undefined,
          sales_count_approx:
            extData.sales_count_approx !== undefined
              ? Number(extData.sales_count_approx)
              : undefined,
          listing_created_at: extData.listing_created_at || undefined,
          listing_type: extData.listing_type || undefined,
          sale_fee_amount:
            typeof extData.sale_fee_amount === "number" ? extData.sale_fee_amount : undefined,
          sale_fee_pct:
            typeof extData.sale_fee_pct === "number" ? extData.sale_fee_pct : undefined,
          shipping_cost:
            typeof extData.shipping_cost === "number" ? extData.shipping_cost : undefined,
          source: "extension",
        };
        usedSource = "extension";
      }

      // Camada 2: Resultado do Multiget Oficial `/items?ids=` + `/sale_price`
      if ((!partial.current_price || partial.current_price <= 0) && mlbId) {
        const itemBody = compMultigetMap.get(mlbId.toUpperCase());
        if (itemBody && Number(itemBody.price) > 0) {
          let resolvedPrice = Number(itemBody.price);
          let resolvedOrig: number | null =
            itemBody.original_price && Number(itemBody.original_price) > resolvedPrice
              ? Number(itemBody.original_price)
              : null;

          const spHeaders: Record<string, string> = accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {};
          const spRes = await fetchJsonWithTimeout<any>(
            `${ML_API_BASE}/items/${itemBody.id || mlbId}/sale_price?context=channel_marketplace`,
            spHeaders,
            3500
          );
          if (spRes.ok && spRes.data && Number(spRes.data.amount) > 0) {
            resolvedPrice = Number(spRes.data.amount);
            if (spRes.data.regular_amount && Number(spRes.data.regular_amount) > resolvedPrice) {
              resolvedOrig = Number(spRes.data.regular_amount);
            }
          }

          const sellerInfo = itemBody.seller_id
            ? sellerMultigetMap.get(String(itemBody.seller_id))
            : undefined;

          partial = {
            title: itemBody.title,
            current_price: resolvedPrice,
            original_price: resolvedOrig,
            seller_name: sellerInfo?.nickname || undefined,
            seller_reputation: sellerInfo?.reputation || undefined,
            shipping_type: mapMlShippingType(
              itemBody.shipping?.logistic_type,
              itemBody.shipping?.free_shipping
            ),
            promo_badge: cleanPromoBadge(null, resolvedPrice, resolvedOrig),
            thumbnail_url: itemBody.thumbnail
              ? String(itemBody.thumbnail).replace("http://", "https://")
              : undefined,
            sales_count_approx:
              itemBody.sold_quantity !== undefined ? Number(itemBody.sold_quantity) : undefined,
            listing_created_at: itemBody.date_created || itemBody.start_time || undefined,
            listing_type: itemBody.listing_type_id || undefined,
            permalink: itemBody.permalink || undefined,
            external_id: itemBody.id || mlbId,
            source: "ml_api",
          };
          usedSource = "ml_api_multiget";
        }
      }

      // Camada 3: API de Busca/Catálogo do Mercado Livre (`/sites/MLB/search` & `/user-products`)
      if (
        (!partial.current_price || partial.current_price <= 0) &&
        platform === "mercadolivre"
      ) {
        const searchResolved = await resolveCompetitorViaMlSearchOrCatalog({
          mlbId,
          mlbuId,
          title: comp.title,
          sellerName: comp.seller_name,
          accessToken,
        });
        if (searchResolved && searchResolved.current_price && searchResolved.current_price > 0) {
          partial = { ...partial, ...searchResolved };
          usedSource = "ml_search_api";
        }
      }

      // Camada 4: Web Scraper Estruturado Limpo (JSON-LD + OpenGraph + Preloaded State + Andes DOM)
      if ((!partial.current_price || partial.current_price <= 0) && normUrl) {
        const scraped = await scrapeCompetitorCleanStructured(normUrl, comp.external_id);
        if (scraped && scraped.current_price && scraped.current_price > 0) {
          partial = { ...scraped, ...partial, current_price: scraped.current_price };
          usedSource = "structured_scraper";
        }
      }

      bumpSource(usedSource);

      const oldPrice = Number(comp.current_price || 0);
      const newPrice =
        partial.current_price && partial.current_price > 0 ? partial.current_price : oldPrice;

      if (newPrice <= 0) return;

      const rawOrig =
        partial.original_price !== undefined
          ? partial.original_price
          : comp.original_price
          ? Number(comp.original_price)
          : null;
      const newOrig = rawOrig && rawOrig > newPrice ? rawOrig : null;

      const resolvedSellerName = cleanSellerName(partial.seller_name || comp.seller_name);
      const matchedFollowedStore = followedStoreByName.get(resolvedSellerName.toLowerCase());

      const resolvedReputation =
        partial.seller_reputation ||
        matchedFollowedStore?.seller_reputation ||
        comp.seller_reputation ||
        "comum";

      const resolvedShipping = partial.shipping_type || comp.shipping_type || "padrao";
      const resolvedBadge = cleanPromoBadge(
        partial.promo_badge ?? comp.promo_badge,
        newPrice,
        newOrig
      );
      const resolvedThumb = partial.thumbnail_url || comp.thumbnail_url || null;
      const resolvedSales =
        partial.sales_count_approx !== undefined && partial.sales_count_approx > 0
          ? partial.sales_count_approx
          : Number(comp.sales_count_approx || 0);

      const resolvedCreatedAt =
        partial.listing_created_at ||
        comp.listing_created_at ||
        estimateMlCreationDate(comp.external_id, resolvedThumb) ||
        null;

      const { meta: existingMeta } = extractCompetitorMetaFromPermalink(comp.permalink);
      const estFees = estimateCompetitorFeesAndShipping(
        newPrice,
        comp.platform || "mercadolivre",
        partial.listing_type || existingMeta.listing_type,
        comp.external_id
      );

      const permalinkWithMeta = encodeCompetitorMetaInPermalink(
        partial.permalink || normUrl || comp.permalink,
        {
          listing_type:
            partial.listing_type || existingMeta.listing_type || estFees.listing_type,
          sale_fee_amount:
            partial.sale_fee_amount ??
            (Math.abs(newPrice - oldPrice) < 0.01 ? existingMeta.sale_fee_amount : null) ??
            estFees.sale_fee_amount,
          sale_fee_pct:
            partial.sale_fee_pct ?? existingMeta.sale_fee_pct ?? estFees.sale_fee_pct,
          shipping_cost:
            partial.shipping_cost ??
            (Math.abs(newPrice - oldPrice) < 0.01 ? existingMeta.shipping_cost : null) ??
            estFees.shipping_cost,
        }
      );

      const priceDiff = Number((newPrice - oldPrice).toFixed(2));
      if (Math.abs(priceDiff) >= 0.01) {
        competitorsChanged++;
        changedIds.add(comp.id);
        if (priceDiff < 0) priceDropsDetected++;
        else priceIncreasesDetected++;
      }

      // Atualiza competitor_listings (o trigger nativo trg_competitor_price_history_log grava em price_history SE E SOMENTE SE o preço mudou!)
      await supabase
        .from("competitor_listings")
        .update({
          title: partial.title || comp.title,
          current_price: newPrice,
          original_price: newOrig,
          seller_name: resolvedSellerName,
          seller_reputation: resolvedReputation,
          shipping_type: resolvedShipping,
          promo_badge: resolvedBadge,
          permalink: permalinkWithMeta,
          thumbnail_url: resolvedThumb,
          sales_count_approx: resolvedSales,
          listing_created_at: resolvedCreatedAt,
          last_scraped_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", comp.id);

      if (comp.external_id) {
        updatedStoreListingsSync.push({
          external_id: comp.external_id,
          current_price: newPrice,
          original_price: newOrig,
          sales_count_approx: resolvedSales,
          shipping_type: resolvedShipping,
        });
      }
    });

    // Sincroniza cruzado os mesmos external_ids na tabela `competitor_store_listings` (Lojas Seguidas) se existirem,
    // mantendo Espião de Concorrentes e Radar Comparativo consistentes sem gastar novas requisições externas!
    if (followedStores.length > 0 && updatedStoreListingsSync.length > 0) {
      const extIds = updatedStoreListingsSync.map((u) => u.external_id);
      const { data: matchingStoreItems } = await supabase
        .from("competitor_store_listings")
        .select("id, external_id, current_price")
        .in("external_id", extIds);

      if (matchingStoreItems && matchingStoreItems.length > 0) {
        const byExt = new Map(updatedStoreListingsSync.map((u) => [u.external_id, u]));
        await runWithConcurrency(matchingStoreItems, MAX_CONCURRENCY, async (row) => {
          const fresh = byExt.get(row.external_id);
          if (!fresh) return;
          if (Math.abs(Number(row.current_price || 0) - fresh.current_price) < 0.01) return;
          await supabase
            .from("competitor_store_listings")
            .update({
              current_price: fresh.current_price,
              original_price: fresh.original_price,
              sales_count_approx: fresh.sales_count_approx,
              shipping_type: fresh.shipping_type,
              last_scraped_at: nowIso,
              updated_at: nowIso,
            })
            .eq("id", row.id);
        });
      }
    }
  }

  // 3. Retorna o payload comparativo consolidado na mesma resposta (evita segundo GET /api/bi/comparative)
  const comparative = await buildComparativeResponseFromDb(supabase, {
    platform,
    statusFilter: "all",
    userId,
  });

  return {
    stats: {
      myListingsChecked,
      myListingsChanged,
      competitorsChecked,
      competitorsChanged,
      followedStoresSynced,
      priceDropsDetected,
      priceIncreasesDetected,
      changedIds: Array.from(changedIds),
      sourcesUsed,
      syncedAt: nowIso,
      durationMs: Date.now() - startedAt,
    },
    comparative,
  };
}
