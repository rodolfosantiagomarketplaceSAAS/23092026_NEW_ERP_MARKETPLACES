import type {
  MlFamilyUpsertInput,
  MlSaleOptionUpsertInput,
  MlVariationMlbRef,
  MlVariationUpsertInput,
} from "@/types/ml-catalog";

const ML_API_BASE = "https://api.mercadolibre.com";
const MULTIGET_CHUNK_SIZE = 20;
const DEFAULT_CONCURRENCY = 6;

const VARIATION_ATTRIBUTE_IDS = new Set([
  "COLOR",
  "MAIN_COLOR",
  "SECONDARY_COLOR",
  "FRAGRANCE",
  "SCENT",
  "AROMA",
  "FLAVOR",
  "VEHICLE_MODEL",
  "COMPATIBLE_VEHICLE",
  "CAR_MODEL",
  "FINISH",
  "SURFACE_FINISH",
  "FABRIC_DESIGN",
  "PATTERN",
  "SIZE",
  "VOLTAGE",
  "CAPACITY",
  "VOLUME_CAPACITY",
  "SIDE",
  "POSITION",
]);

export interface MlItemRaw {
  id: string;
  title: string;
  category_id?: string;
  domain_id?: string;
  price?: number;
  base_price?: number;
  original_price?: number | null;
  available_quantity?: number;
  sold_quantity?: number;
  listing_type_id?: string;
  status?: string;
  sub_status?: string[];
  permalink?: string;
  thumbnail?: string;
  pictures?: Array<{ id?: string; url?: string; secure_url?: string }>;
  shipping?: {
    free_shipping?: boolean;
    logistic_type?: string;
    mode?: string;
  };
  family_id?: string | number | null;
  family_name?: string | null;
  user_product_id?: string | null;
  parent_item_id?: string | null;
  catalog_product_id?: string | null;
  catalog_listing?: boolean;
  health?: number | null;
  seller_custom_field?: string | null;
  attributes?: Array<{ id?: string; value_name?: string | null }>;
  variation_attributes?: Array<{ id?: string; value_name?: string | null }>;
  sale_terms?: Array<{ id?: string; value_name?: string | null }>;
  variations?: Array<{
    id?: string | number;
    price?: number;
    original_price?: number | null;
    available_quantity?: number;
    sold_quantity?: number;
    seller_custom_field?: string | null;
    user_product_id?: string | null;
    picture_ids?: string[];
    attributes?: Array<{ id?: string; value_name?: string | null }>;
    attribute_combinations?: Array<{ id?: string; value_name?: string | null }>;
  }>;
}

export interface EnrichedMlItemData {
  item: MlItemRaw;
  basePrice: number;
  promoPrice: number | null;
  activePrice: number;
  hasWholesale: boolean;
  saleFeeAmount: number;
  saleFeePct: number;
  shippingCostAmount: number;
  freeShipping: boolean;
  shippingModeLabel: string;
  shippingLogisticType: string;
  netReceiveAmount: number;
  visits7d: number;
  sales7d: number;
  sales30d: number;
  conversionRate7d: number;
  healthScore: number | null;
  pendingGoalsCount: number;
  recommendationTitle: string | null;
  recommendationAction: string | null;
}

export interface NormalizedMlCatalogBatch {
  families: MlFamilyUpsertInput[];
  variations: MlVariationUpsertInput[];
  saleOptions: MlSaleOptionUpsertInput[];
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMlbDigits(itemId: string): string {
  return itemId.replace(/^MLB-?/i, "").trim() || itemId;
}

export function isPremiumListingType(listingTypeId?: string | null): boolean {
  const normalized = String(listingTypeId || "").toLowerCase();
  return normalized.includes("gold_pro") || normalized === "premium";
}

export function getChannelLabel(listingTypeId?: string | null): "Clássico" | "Premium" {
  return isPremiumListingType(listingTypeId) ? "Premium" : "Clássico";
}

export function mapLogisticType(logisticType?: string | null): string {
  if (logisticType === "fulfillment") return "ml_full";
  if (logisticType === "self_service") return "ml_flex";
  if (logisticType === "cross_docking" || logisticType === "xd_drop_off") return "ml_coleta";
  return "padrao";
}

export function normalizeItemStatus(
  status?: string | null
): "active" | "paused" | "under_review" | "closed" {
  if (status === "active") return "active";
  if (status === "under_review") return "under_review";
  if (status === "paused") return "paused";
  return "closed";
}

export function extractItemSku(item: MlItemRaw): string | null {
  const skuAttr = item.attributes?.find(
    (a) => a.id === "SELLER_SKU" || a.id === "SKU"
  );
  const firstVarSkuAttr = item.variations?.[0]?.attributes?.find(
    (a) => a.id === "SELLER_SKU" || a.id === "SKU"
  );
  const candidate =
    skuAttr?.value_name ||
    item.seller_custom_field ||
    firstVarSkuAttr?.value_name ||
    item.variations?.[0]?.seller_custom_field ||
    null;

  return candidate && candidate.trim() !== "" ? candidate.trim() : null;
}

export function extractVariationName(item: MlItemRaw): string {
  // 1. User Products: título = [family_name] + " " + [Nome da Variação]
  if (item.family_name && item.title) {
    const famClean = item.family_name.trim();
    const titleClean = item.title.trim();
    if (
      titleClean.toLowerCase().startsWith(famClean.toLowerCase()) &&
      titleClean.length > famClean.length + 1
    ) {
      const suffix = titleClean
        .slice(famClean.length)
        .replace(/^[\s\-|:/]+/, "")
        .trim();
      if (suffix.length >= 2) {
        return suffix;
      }
    }
  }

  // 2. variation_attributes explícito do item
  if (Array.isArray(item.variation_attributes) && item.variation_attributes.length > 0) {
    const parts = item.variation_attributes
      .map((a) => a.value_name?.trim())
      .filter((v): v is string => Boolean(v));
    if (parts.length > 0) return parts.join(" | ");
  }

  // 3. attribute_combinations da primeira variação (itens legados de 1 variação)
  if (
    Array.isArray(item.variations) &&
    item.variations.length === 1 &&
    Array.isArray(item.variations[0].attribute_combinations)
  ) {
    const parts = item.variations[0].attribute_combinations
      .map((c) => c.value_name?.trim())
      .filter((v): v is string => Boolean(v));
    if (parts.length > 0) return parts.join(" | ");
  }

  // 4. Atributos físicos relevantes
  if (Array.isArray(item.attributes)) {
    const values: string[] = [];
    for (const attr of item.attributes) {
      const id = String(attr.id || "").toUpperCase();
      const val = attr.value_name?.trim();
      if (
        VARIATION_ATTRIBUTE_IDS.has(id) &&
        val &&
        val.length <= 40 &&
        !val.includes(",") &&
        !values.includes(val)
      ) {
        values.push(val);
      }
    }
    if (values.length > 0) return values.join(" | ");
  }

  return item.title;
}

/**
 * Ordenação determinística das Opções de Venda (Nível 3) dentro de uma Variação (Nível 2).
 * Esta mesma ordem é usada para construir `mlbs_list` no Nível 2, garantindo alinhamento 1:1.
 */
export function sortSaleOptions(options: MlSaleOptionUpsertInput[]): MlSaleOptionUpsertInput[] {
  return [...options].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const aPremium = isPremiumListingType(a.listing_type_id) ? 1 : 0;
    const bPremium = isPremiumListingType(b.listing_type_id) ? 1 : 0;
    if (aPremium !== bPremium) return aPremium - bPremium;

    const aCatalog = a.catalog_listing ? 1 : 0;
    const bCatalog = b.catalog_listing ? 1 : 0;
    if (aCatalog !== bCatalog) return aCatalog - bCatalog;

    const aPrice = a.promo_price ?? a.base_price;
    const bPrice = b.promo_price ?? b.base_price;
    if (aPrice !== bPrice) return aPrice - bPrice;

    return a.item_id.localeCompare(b.item_id);
  });
}

/**
 * Normaliza a lista de itens enriquecidos da API do ML na hierarquia estrita de 3 níveis:
 * Nível 1 (`ml_families`) → Nível 2 (`ml_variations`) → Nível 3 (`ml_sale_options`).
 */
export function normalizeCatalogHierarchy(
  enrichedItems: EnrichedMlItemData[]
): NormalizedMlCatalogBatch {
  const familyBuckets = new Map<
    string,
    {
      isOfficial: boolean;
      title: string;
      thumbnailUrl: string | null;
      items: EnrichedMlItemData[];
    }
  >();

  for (const entry of enrichedItems) {
    const { item } = entry;
    const rawFamilyId =
      item.family_id !== null && item.family_id !== undefined && String(item.family_id).trim() !== ""
        ? String(item.family_id).trim()
        : null;
    const familyId = rawFamilyId || `LEGACY_${item.id}`;
    const isOfficial = Boolean(rawFamilyId);
    const primaryThumb =
      item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || item.thumbnail || null;

    const existing = familyBuckets.get(familyId);
    if (!existing) {
      familyBuckets.set(familyId, {
        isOfficial,
        title: (item.family_name && item.family_name.trim()) || item.title,
        thumbnailUrl: primaryThumb,
        items: [entry],
      });
    } else {
      if (!existing.thumbnailUrl && primaryThumb) {
        existing.thumbnailUrl = primaryThumb;
      }
      if (item.family_name && item.family_name.trim() && existing.title === existing.items[0]?.item.title) {
        existing.title = item.family_name.trim();
      }
      existing.items.push(entry);
    }
  }

  const families: MlFamilyUpsertInput[] = [];
  const variations: MlVariationUpsertInput[] = [];
  const saleOptions: MlSaleOptionUpsertInput[] = [];

  for (const [familyId, bucket] of Array.from(familyBuckets.entries())) {
    const variationBuckets = new Map<
      string,
      {
        variationName: string;
        sku: string | null;
        thumbnailUrl: string | null;
        availableQuantity: number;
        options: MlSaleOptionUpsertInput[];
      }
    >();

    for (const entry of bucket.items) {
      const { item } = entry;
      const rawUpId =
        item.user_product_id?.trim() ||
        item.variations?.[0]?.user_product_id?.trim() ||
        null;
      const userProductId = rawUpId || `LEGACY_UP_${item.id}`;
      const sku = extractItemSku(item);
      const varName = extractVariationName(item);
      const thumb =
        item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || item.thumbnail || null;
      const status = normalizeItemStatus(item.status);
      const permalink =
        item.permalink ||
        `https://produto.mercadolivre.com.br/${item.id.replace(/^MLB(\d+)/i, "MLB-$1")}`;
      const subStatus =
        Array.isArray(item.sub_status) && item.sub_status.length > 0
          ? String(item.sub_status[0])
          : null;

      const optionRow: MlSaleOptionUpsertInput = {
        item_id: item.id,
        user_product_id: userProductId,
        family_id: familyId,
        title: item.title,
        category_id: item.category_id || null,
        listing_type_id: item.listing_type_id || "gold_special",
        catalog_listing: Boolean(item.catalog_listing),
        catalog_product_id: item.catalog_product_id ? String(item.catalog_product_id) : null,
        has_wholesale: entry.hasWholesale,
        base_price: entry.basePrice,
        promo_price: entry.promoPrice,
        sale_fee_amount: entry.saleFeeAmount,
        sale_fee_pct: entry.saleFeePct,
        shipping_cost_amount: entry.shippingCostAmount,
        free_shipping: entry.freeShipping,
        shipping_mode_label: entry.shippingModeLabel,
        shipping_logistic_type: entry.shippingLogisticType,
        net_receive_amount: entry.netReceiveAmount,
        visits_7d: entry.visits7d,
        sales_7d: entry.sales7d,
        sales_30d: entry.sales30d,
        sold_quantity: Math.max(0, Number(item.sold_quantity || 0)),
        conversion_rate_7d: entry.conversionRate7d,
        health_score: entry.healthScore,
        pending_goals_count: entry.pendingGoalsCount,
        recommendation_title: entry.recommendationTitle,
        recommendation_action: entry.recommendationAction,
        status,
        sub_status: subStatus,
        permalink,
        thumbnail_url: thumb,
      };

      const itemStock = Math.max(0, Number(item.available_quantity || 0));
      const existingVar = variationBuckets.get(userProductId);

      if (!existingVar) {
        variationBuckets.set(userProductId, {
          variationName: varName,
          sku,
          thumbnailUrl: thumb,
          availableQuantity: itemStock,
          options: [optionRow],
        });
      } else {
        if (!existingVar.sku && sku) existingVar.sku = sku;
        if (!existingVar.thumbnailUrl && thumb) existingVar.thumbnailUrl = thumb;
        if (existingVar.variationName === bucket.title && varName !== bucket.title) {
          existingVar.variationName = varName;
        }
        // Estoque unificado da variação (User Product): NUNCA somar entre Clássico e Premium
        existingVar.availableQuantity = Math.max(existingVar.availableQuantity, itemStock);
        existingVar.options.push(optionRow);
      }
    }

    let familyHasActiveOption = false;

    for (const [userProductId, vBucket] of Array.from(variationBuckets.entries())) {
      const sortedOpts = sortSaleOptions(vBucket.options);
      if (sortedOpts.some((o) => o.status === "active")) {
        familyHasActiveOption = true;
      }

      const mlbsList: MlVariationMlbRef[] = sortedOpts.map((o) => ({
        item_id: o.item_id,
        clean_digits: formatMlbDigits(o.item_id),
        permalink: o.permalink,
        listing_type_id: o.listing_type_id,
        channel_label: getChannelLabel(o.listing_type_id),
        catalog_listing: o.catalog_listing,
        status: o.status,
      }));

      variations.push({
        user_product_id: userProductId,
        family_id: familyId,
        variation_name: vBucket.variationName,
        sku: vBucket.sku,
        thumbnail_url: vBucket.thumbnailUrl,
        available_quantity: vBucket.availableQuantity,
        mlbs_list: mlbsList,
      });

      saleOptions.push(...sortedOpts);
    }

    families.push({
      family_id: familyId,
      is_official_family_id: bucket.isOfficial,
      title: bucket.title,
      thumbnail_url: bucket.thumbnailUrl,
      status: familyHasActiveOption ? "active" : "paused",
    });
  }

  return { families, variations, saleOptions };
}

// ==============================================================================
// CLIENTE HTTP RESILIENTE PARA A API DO MERCADO LIVRE (RETRY + RATE LIMIT 429)
// ==============================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMlWithRetry(
  url: string,
  accessToken: string,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  let lastRes: Response | null = null;

  while (attempt <= maxRetries) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.ok || (res.status !== 429 && res.status < 500)) {
      return res;
    }

    lastRes = res;
    attempt++;
    if (attempt > maxRetries) break;

    const retryAfterSec = Number(res.headers.get("retry-after"));
    const backoffMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 5000)
        : 450 * Math.pow(2, attempt - 1);
    await sleep(backoffMs);
  }

  return lastRes as Response;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIdx = 0;

  async function runWorker() {
    while (nextIdx < items.length) {
      const currentIdx = nextIdx++;
      results[currentIdx] = await worker(items[currentIdx]);
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
}

export async function fetchAllSellerItemIds(
  sellerId: string | number,
  accessToken: string,
  maxFetch = 3500
): Promise<{ itemIds: string[]; authFailedStatus?: number }> {
  const uniqueIds = new Set<string>();
  const statusesToFetch = ["active", "paused", "under_review"];

  for (const status of statusesToFetch) {
    let scrollId: string | null = null;
    let offset = 0;
    const limit = 100;
    let useScan = true;

    while (uniqueIds.size < maxFetch) {
      let searchUrl = "";
      if (useScan) {
        searchUrl = `${ML_API_BASE}/users/${sellerId}/items/search?search_type=scan&status=${status}&limit=${limit}`;
        if (scrollId) {
          searchUrl += `&scroll_id=${encodeURIComponent(scrollId)}`;
        }
      } else {
        searchUrl = `${ML_API_BASE}/users/${sellerId}/items/search?status=${status}&limit=50&offset=${offset}`;
      }

      const searchRes = await fetchMlWithRetry(searchUrl, accessToken);
      if (!searchRes.ok) {
        if (searchRes.status === 401 || searchRes.status === 403) {
          return { itemIds: Array.from(uniqueIds), authFailedStatus: searchRes.status };
        }
        if (useScan && !scrollId) {
          useScan = false;
          continue;
        }
        break;
      }

      const searchData = await searchRes.json();
      const results: string[] = Array.isArray(searchData.results) ? searchData.results : [];
      if (results.length === 0) break;

      for (const id of results) {
        if (id && typeof id === "string") {
          uniqueIds.add(id);
        }
      }

      if (useScan) {
        scrollId = searchData.scroll_id || null;
        if (!scrollId) break;
      } else {
        const total = Number(searchData.paging?.total || 0);
        offset += 50;
        if (offset >= total || offset >= 1000 || results.length < 50) {
          break;
        }
      }
    }
  }

  return { itemIds: Array.from(uniqueIds) };
}

export async function fetchItemsMultiget(
  itemIds: string[],
  accessToken: string
): Promise<MlItemRaw[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < itemIds.length; i += MULTIGET_CHUNK_SIZE) {
    chunks.push(itemIds.slice(i, i + MULTIGET_CHUNK_SIZE));
  }

  const chunkResults = await runWithConcurrency(chunks, 4, async (chunk) => {
    const url = `${ML_API_BASE}/items?ids=${chunk.join(",")}&include_attributes=all`;
    const res = await fetchMlWithRetry(url, accessToken);
    if (!res.ok) return [] as MlItemRaw[];

    const data = await res.json();
    if (!Array.isArray(data)) return [] as MlItemRaw[];

    return data
      .filter((w: { code?: number; body?: MlItemRaw }) => w.code === 200 && Boolean(w.body?.id))
      .map((w: { body: MlItemRaw }) => w.body);
  });

  return chunkResults.flat();
}

/**
 * Busca visitas reais dos últimos 7 dias por MLB via `/items/visits/time_window`.
 */
export async function fetchVisits7dByItem(
  itemIds: string[],
  accessToken: string
): Promise<Map<string, number>> {
  const visitsMap = new Map<string, number>();
  const chunks: string[][] = [];
  for (let i = 0; i < itemIds.length; i += MULTIGET_CHUNK_SIZE) {
    chunks.push(itemIds.slice(i, i + MULTIGET_CHUNK_SIZE));
  }

  await runWithConcurrency(chunks, 4, async (chunk) => {
    const url = `${ML_API_BASE}/items/visits/time_window?ids=${chunk.join(",")}&last=7&unit=day`;
    const res = await fetchMlWithRetry(url, accessToken);
    if (!res.ok) return;

    const payload = await res.json().catch(() => null);
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        const id = entry?.item_id;
        const total = Number(entry?.total_visits ?? 0);
        if (id && Number.isFinite(total)) {
          visitsMap.set(String(id), Math.max(0, Math.round(total)));
        }
      }
    } else if (payload && typeof payload === "object") {
      for (const [id, val] of Object.entries(payload)) {
        const total =
          typeof val === "number"
            ? val
            : Number((val as { total_visits?: number })?.total_visits ?? 0);
        if (Number.isFinite(total)) {
          visitsMap.set(id, Math.max(0, Math.round(total)));
        }
      }
    }
  });

  return visitsMap;
}

/**
 * Busca pedidos pagos reais dos últimos 30 dias (e separa 7 dias) via `/orders/search`
 * agrupados rigorosamente por `order_item.item.id` (MLB).
 */
export async function fetchPaidOrdersMetricsByItem(
  sellerId: string | number,
  accessToken: string
): Promise<{ sales7d: Map<string, number>; sales30d: Map<string, number> }> {
  const sales7d = new Map<string, number>();
  const sales30d = new Map<string, number>();

  const now = Date.now();
  const from30dIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff7dMs = now - 7 * 24 * 60 * 60 * 1000;

  let offset = 0;
  const limit = 50;
  const maxOffset = 2000;

  while (offset < maxOffset) {
    const url = `${ML_API_BASE}/orders/search?seller=${encodeURIComponent(
      String(sellerId)
    )}&order.status=paid&order.date_created.from=${encodeURIComponent(
      from30dIso
    )}&sort=date_desc&limit=${limit}&offset=${offset}`;

    const res = await fetchMlWithRetry(url, accessToken);
    if (!res.ok) break;

    const data = await res.json().catch(() => null);
    const results: Array<{
      date_created?: string;
      status?: string;
      order_items?: Array<{ item?: { id?: string }; quantity?: number }>;
    }> = Array.isArray(data?.results) ? data.results : [];

    if (results.length === 0) break;

    for (const order of results) {
      if (order.status && order.status !== "paid") continue;
      const orderTimeMs = order.date_created ? Date.parse(order.date_created) : 0;
      const isLast7d = orderTimeMs >= cutoff7dMs;

      for (const orderItem of order.order_items || []) {
        const mlbId = orderItem.item?.id;
        const qty = Math.max(0, Number(orderItem.quantity || 0));
        if (!mlbId || qty <= 0) continue;

        sales30d.set(mlbId, (sales30d.get(mlbId) || 0) + qty);
        if (isLast7d) {
          sales7d.set(mlbId, (sales7d.get(mlbId) || 0) + qty);
        }
      }
    }

    const total = Number(data?.paging?.total || 0);
    offset += results.length;
    if (offset >= total || results.length < limit) break;
  }

  return { sales7d, sales30d };
}

/**
 * Busca preço cheio (`regular_amount`) e preço ativo/promocional (`amount`) exatos
 * via `GET /items/{ITEM_ID}/sale_price?context=channel_marketplace`.
 */
async function fetchSalePriceExact(
  item: MlItemRaw,
  accessToken: string
): Promise<{ basePrice: number; promoPrice: number | null; activePrice: number; hasWholesale: boolean }> {
  const fallbackBase = Number(item.original_price || item.base_price || item.price || 0);
  const fallbackPrice = Number(item.price || 0);

  let basePrice = fallbackBase > 0 ? fallbackBase : fallbackPrice;
  let promoPrice: number | null =
    item.original_price && Number(item.original_price) > fallbackPrice && fallbackPrice > 0
      ? fallbackPrice
      : null;

  let hasWholesale = Boolean(
    Array.isArray(item.sale_terms) &&
      item.sale_terms.some((t) => String(t.id || "").toUpperCase().includes("WHOLESALE"))
  );

  try {
    const url = `${ML_API_BASE}/items/${encodeURIComponent(
      item.id
    )}/sale_price?context=channel_marketplace`;
    const res = await fetchMlWithRetry(url, accessToken, 2);

    if (res.ok) {
      const data = await res.json();
      const amount = Number(data?.amount ?? 0);
      const regularAmount = Number(data?.regular_amount ?? 0);

      if (amount > 0) {
        if (regularAmount > amount) {
          basePrice = round2(regularAmount);
          promoPrice = round2(amount);
        } else {
          basePrice = round2(amount);
          promoPrice = null;
        }
      }

      if (data?.metadata?.promotion_type) {
        const promoType = String(data.metadata.promotion_type).toUpperCase();
        if (promoType.includes("WHOLESALE") || promoType.includes("VOLUME")) {
          hasWholesale = true;
        }
      }
    }
  } catch {
    // Mantém fallback dos campos do próprio item
  }

  // Verifica preços de atacado no endpoint de preços por quantidade quando não detectado ainda
  if (!hasWholesale) {
    try {
      const pricesRes = await fetchMlWithRetry(
        `${ML_API_BASE}/items/${encodeURIComponent(item.id)}/prices`,
        accessToken,
        1
      );
      if (pricesRes.ok) {
        const pricesData = await pricesRes.json();
        const pricesArr = Array.isArray(pricesData?.prices) ? pricesData.prices : [];
        hasWholesale = pricesArr.some(
          (p: { type?: string; conditions?: { min_quantity?: number; context_restrictions?: string[] } }) =>
            String(p?.type || "").toLowerCase() === "wholesale" ||
            Number(p?.conditions?.min_quantity || 0) > 1 ||
            (Array.isArray(p?.conditions?.context_restrictions) &&
              p.conditions.context_restrictions.some((c) =>
                String(c).toLowerCase().includes("wholesale")
              ))
        );
      }
    } catch {
      // Silencioso: alguns itens não possuem endpoint /prices habilitado
    }
  }

  const activePrice = round2(promoPrice ?? basePrice);
  return {
    basePrice: round2(basePrice),
    promoPrice,
    activePrice,
    hasWholesale,
  };
}

/**
 * Consulta tarifa exata de venda na API `/sites/MLB/listing_prices` com cache por chave.
 */
async function fetchListingFeeExact(
  activePrice: number,
  listingTypeId: string,
  categoryId: string | undefined,
  accessToken: string,
  feeCache: Map<string, { amount: number; pct: number }>
): Promise<{ saleFeeAmount: number; saleFeePct: number }> {
  if (activePrice <= 0) {
    return { saleFeeAmount: 0, saleFeePct: 0 };
  }

  const cacheKey = `${categoryId || "none"}|${listingTypeId}|${activePrice.toFixed(2)}`;
  const cached = feeCache.get(cacheKey);
  if (cached) {
    return { saleFeeAmount: cached.amount, saleFeePct: cached.pct };
  }

  try {
    const params = new URLSearchParams({
      price: activePrice.toFixed(2),
      listing_type_id: listingTypeId,
    });
    if (categoryId) {
      params.set("category_id", categoryId);
    }

    const res = await fetchMlWithRetry(
      `${ML_API_BASE}/sites/MLB/listing_prices?${params.toString()}`,
      accessToken,
      2
    );

    if (res.ok) {
      const data = await res.json();
      const entry = Array.isArray(data) ? data[0] : data;
      const feeAmount = Number(entry?.sale_fee_amount ?? 0);
      const pctFromDetails = Number(entry?.sale_fee_details?.percentage_fee ?? 0);
      const computedPct =
        pctFromDetails > 0
          ? pctFromDetails
          : activePrice > 0 && feeAmount > 0
          ? round2((feeAmount / activePrice) * 100)
          : 0;

      if (Number.isFinite(feeAmount) && feeAmount >= 0) {
        const result = { amount: round2(feeAmount), pct: round2(computedPct) };
        feeCache.set(cacheKey, result);
        return { saleFeeAmount: result.amount, saleFeePct: result.pct };
      }
    }
  } catch {
    // Fallback controlado abaixo apenas se API falhar
  }

  return { saleFeeAmount: 0, saleFeePct: 0 };
}

/**
 * Consulta custo real de envio pago pelo vendedor via `/users/{USER_ID}/shipping_options/free?item_id={ITEM_ID}`.
 */
async function fetchShippingCostExact(
  sellerId: string | number,
  item: MlItemRaw,
  accessToken: string
): Promise<{ shippingCostAmount: number; freeShipping: boolean; shippingModeLabel: string }> {
  const freeShipping = Boolean(item.shipping?.free_shipping);
  const shippingModeLabel = freeShipping ? "Frete grátis" : "Envio por conta do comprador";

  try {
    const url = `${ML_API_BASE}/users/${encodeURIComponent(
      String(sellerId)
    )}/shipping_options/free?item_id=${encodeURIComponent(item.id)}`;
    const res = await fetchMlWithRetry(url, accessToken, 2);

    if (res.ok) {
      const data = await res.json();
      const listCost = Number(
        data?.coverage?.all_country?.list_cost ??
          data?.coverage?.all_country?.cost ??
          data?.list_cost ??
          0
      );

      if (Number.isFinite(listCost) && listCost >= 0) {
        return {
          shippingCostAmount: round2(listCost),
          freeShipping,
          shippingModeLabel,
        };
      }
    }
  } catch {
    // Fallback zero caso API de frete retorne indisponibilidade temporária
  }

  return {
    shippingCostAmount: 0,
    freeShipping,
    shippingModeLabel,
  };
}

/**
 * Consulta nota de qualidade real (`/health`) e objetivos/recomendações (`/health/actions`) por MLB.
 */
async function fetchHealthAndActionsExact(
  item: MlItemRaw,
  accessToken: string
): Promise<{
  healthScore: number | null;
  pendingGoalsCount: number;
  recommendationTitle: string | null;
  recommendationAction: string | null;
}> {
  let healthScore: number | null =
    typeof item.health === "number" && item.health > 0
      ? Math.round(item.health <= 1 ? item.health * 100 : item.health)
      : null;
  let pendingGoalsCount = 0;
  let recommendationTitle: string | null = null;
  let recommendationAction: string | null = null;

  const [healthRes, actionsRes] = await Promise.all([
    fetchMlWithRetry(`${ML_API_BASE}/items/${encodeURIComponent(item.id)}/health`, accessToken, 1).catch(
      () => null
    ),
    fetchMlWithRetry(
      `${ML_API_BASE}/items/${encodeURIComponent(item.id)}/health/actions`,
      accessToken,
      1
    ).catch(() => null),
  ]);

  if (healthRes && healthRes.ok) {
    const hData = await healthRes.json().catch(() => null);
    const rawScore = Number(hData?.health ?? hData?.score ?? NaN);
    if (Number.isFinite(rawScore) && rawScore >= 0) {
      healthScore = Math.min(100, Math.max(0, Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)));
    }
    if (Array.isArray(hData?.goals)) {
      const pending = hData.goals.filter(
        (g: { status?: string; apply?: boolean }) =>
          g.apply !== false && g.status !== "completed" && g.status !== "passed"
      );
      pendingGoalsCount = pending.length;
    }
  }

  if (actionsRes && actionsRes.ok) {
    const aData = await actionsRes.json().catch(() => null);
    const actions: Array<{
      id?: string;
      name?: string;
      title?: string;
      description?: string;
      action?: string;
    }> = Array.isArray(aData?.actions)
      ? aData.actions
      : Array.isArray(aData)
      ? aData
      : [];

    if (actions.length > 0) {
      if (pendingGoalsCount === 0) {
        pendingGoalsCount = actions.length;
      }
      const primary = actions[0];
      recommendationTitle = (primary.title || primary.name || primary.id || "").trim() || null;
      recommendationAction = (primary.description || primary.action || "").trim() || null;
    }
  }

  return {
    healthScore,
    pendingGoalsCount,
    recommendationTitle,
    recommendationAction,
  };
}

/**
 * Orquestra o pipeline completo de extração da API do Mercado Livre para uma conta de vendedor.
 */
export async function extractMercadoLivreCatalog(
  sellerId: string | number,
  accessToken: string
): Promise<{
  totalFound: number;
  authFailedStatus?: number;
  enrichedItems: EnrichedMlItemData[];
  normalized: NormalizedMlCatalogBatch;
}> {
  const { itemIds, authFailedStatus } = await fetchAllSellerItemIds(sellerId, accessToken);
  if (authFailedStatus && itemIds.length === 0) {
    return {
      totalFound: 0,
      authFailedStatus,
      enrichedItems: [],
      normalized: { families: [], variations: [], saleOptions: [] },
    };
  }

  if (itemIds.length === 0) {
    return {
      totalFound: 0,
      enrichedItems: [],
      normalized: { families: [], variations: [], saleOptions: [] },
    };
  }

  // 1. Multiget de itens + visitas 7d + pedidos pagos 7d/30d em paralelo
  const [rawItems, visits7dMap, orderMetrics] = await Promise.all([
    fetchItemsMultiget(itemIds, accessToken),
    fetchVisits7dByItem(itemIds, accessToken),
    fetchPaidOrdersMetricsByItem(sellerId, accessToken),
  ]);

  // 2. Enriquecimento por item (sale_price, listing_prices, shipping_options/free, health/actions)
  const feeCache = new Map<string, { amount: number; pct: number }>();

  const enrichedItems = await runWithConcurrency(rawItems, DEFAULT_CONCURRENCY, async (item) => {
    const listingTypeId = item.listing_type_id || "gold_special";

    const [priceInfo, shippingInfo, healthInfo] = await Promise.all([
      fetchSalePriceExact(item, accessToken),
      fetchShippingCostExact(sellerId, item, accessToken),
      fetchHealthAndActionsExact(item, accessToken),
    ]);

    const feeInfo = await fetchListingFeeExact(
      priceInfo.activePrice,
      listingTypeId,
      item.category_id,
      accessToken,
      feeCache
    );

    const netReceiveAmount = round2(
      Math.max(0, priceInfo.activePrice - feeInfo.saleFeeAmount - shippingInfo.shippingCostAmount)
    );

    const visits7d = visits7dMap.get(item.id) ?? 0;
    const sales7d = orderMetrics.sales7d.get(item.id) ?? 0;
    const sales30d = orderMetrics.sales30d.get(item.id) ?? 0;
    const conversionRate7d =
      visits7d > 0 ? round2((sales7d / visits7d) * 100) : 0;

    return {
      item,
      basePrice: priceInfo.basePrice,
      promoPrice: priceInfo.promoPrice,
      activePrice: priceInfo.activePrice,
      hasWholesale: priceInfo.hasWholesale,
      saleFeeAmount: feeInfo.saleFeeAmount,
      saleFeePct: feeInfo.saleFeePct,
      shippingCostAmount: shippingInfo.shippingCostAmount,
      freeShipping: shippingInfo.freeShipping,
      shippingModeLabel: shippingInfo.shippingModeLabel,
      shippingLogisticType: mapLogisticType(item.shipping?.logistic_type),
      netReceiveAmount,
      visits7d,
      sales7d,
      sales30d,
      conversionRate7d,
      healthScore: healthInfo.healthScore,
      pendingGoalsCount: healthInfo.pendingGoalsCount,
      recommendationTitle: healthInfo.recommendationTitle,
      recommendationAction: healthInfo.recommendationAction,
    };
  });

  const normalized = normalizeCatalogHierarchy(enrichedItems);

  return {
    totalFound: itemIds.length,
    enrichedItems,
    normalized,
  };
}
