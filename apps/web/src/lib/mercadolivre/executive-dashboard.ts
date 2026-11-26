import type { AuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getActiveMarketplaceToken,
  getMarketplaceIntegrations,
  type MarketplaceAccountInfo,
} from "@/lib/services/marketplaceIntegrations";
import {
  applyTenantFilter,
  isMissingTableError,
} from "@/lib/mercadolivre/tenant-scope";
import {
  isCancelledOrReturned,
  roundCurrency,
  toBrazilDateKeyAndLabel,
} from "@/lib/mercadolivre/sales-analytics";
import type {
  ActionRadarPayload,
  ConversionDropAlertItem,
  CriticalMarginAlertItem,
  DailyEvolutionPoint,
  ExecutiveDashboardResponse,
  PortfolioProductRow,
  StockoutAlertItem,
  UrgentShipmentAlertItem,
} from "@/types/executive-dashboard";

const ML_API_BASE = "https://api.mercadolibre.com";

/**
 * Long-lived server-side caches to protect Supabase, Vercel, and Mercado Livre free-tier limits:
 * - Dashboard payload cache: 30 minutes (1800s)
 * - ML live API (unanswered questions): 60 minutes (3600s)
 */
export const DASHBOARD_CACHE_TTL_MS = 30 * 60 * 1000;
export const ML_ENRICHMENT_CACHE_TTL_MS = 60 * 60 * 1000;
const CRITICAL_MARGIN_THRESHOLD_PCT = 10.0;
const MAX_CACHE_ENTRIES = 120;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  generatedAt: string;
}

export interface MlQuestionsSummary {
  unansweredQuestionsCount: number;
  overdueQuestionsCount: number;
}

const globalForDashboardCache = globalThis as unknown as {
  __erpExecutiveDashboardCacheV2?: Map<string, CacheEntry<ExecutiveDashboardResponse>>;
  __erpMlQuestionsCache?: Map<string, CacheEntry<MlQuestionsSummary>>;
};

const dashboardCache =
  globalForDashboardCache.__erpExecutiveDashboardCacheV2 ??
  new Map<string, CacheEntry<ExecutiveDashboardResponse>>();
globalForDashboardCache.__erpExecutiveDashboardCacheV2 = dashboardCache;

const mlQuestionsCache =
  globalForDashboardCache.__erpMlQuestionsCache ??
  new Map<string, CacheEntry<MlQuestionsSummary>>();
globalForDashboardCache.__erpMlQuestionsCache = mlQuestionsCache;

function pruneMapIfNeeded<T>(map: Map<string, CacheEntry<T>>) {
  if (map.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  Array.from(map.entries()).forEach(([k, entry]) => {
    if (entry.expiresAt <= now) {
      map.delete(k);
    }
  });
  if (map.size > MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

function addDaysToIsoDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function diffDaysInclusive(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const end = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(days, 1);
}

function diagnoseDecliningProduct(row: {
  availableQuantity: number | null;
  listingStatus: string | null;
  listingVisits: number;
  unitsSold: number;
  prevUnitsSold: number;
}): { diagnosis: string; tone: "danger" | "warning" | "info" } {
  if (row.listingStatus && row.listingStatus !== "active") {
    return { diagnosis: "Anúncio pausado ou encerrado", tone: "danger" };
  }
  if (row.availableQuantity !== null && row.availableQuantity <= 0) {
    return { diagnosis: "Falta de estoque (zerado)", tone: "danger" };
  }
  if (row.availableQuantity !== null && row.availableQuantity <= 3) {
    return { diagnosis: "Estoque baixo limitando entrega", tone: "warning" };
  }
  if (row.listingVisits >= 80 && row.unitsSold <= Math.floor(row.prevUnitsSold * 0.5)) {
    return { diagnosis: "Perda de conversão / BuyBox", tone: "warning" };
  }
  if (row.listingVisits > 0 && row.listingVisits < 40) {
    return { diagnosis: "Queda de visitas / tráfego", tone: "warning" };
  }
  return { diagnosis: "Desaceleração de demanda / preço", tone: "info" };
}

async function fetchJsonWithTimeout<T>(
  url: string,
  accessToken: string,
  timeoutMs = 5000
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, data: null };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMlQuestionsSummary(params: {
  ctx: Pick<AuthContext, "userId" | "organizationId">;
  accounts: MarketplaceAccountInfo[];
  selectedStore: string;
  forceRefresh: boolean;
}): Promise<MlQuestionsSummary> {
  const { ctx, accounts, selectedStore, forceRefresh } = params;
  const mlAccounts = accounts.filter(
    (a) =>
      a.platform === "mercadolivre" &&
      a.status !== "reauth_required" &&
      (selectedStore === "all" || a.account_name === selectedStore)
  );

  if (mlAccounts.length === 0) {
    return { unansweredQuestionsCount: 0, overdueQuestionsCount: 0 };
  }

  const tenantKey = ctx.organizationId ?? ctx.userId;
  const cacheKey = `${tenantKey}:${selectedStore}`;
  if (!forceRefresh) {
    const cached = mlQuestionsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const accountsToQuery = mlAccounts.slice(0, 3);
  let unansweredTotal = 0;
  let overdueQuestionsTotal = 0;
  const fifteenMinAgoMs = Date.now() - 15 * 60 * 1000;

  await Promise.all(
    accountsToQuery.map(async (account) => {
      const token = await getActiveMarketplaceToken(
        "mercadolivre",
        { userId: ctx.userId, organizationId: ctx.organizationId },
        account.seller_id
      ).catch(() => null);

      if (!token) return;

      const questionsRes = await fetchJsonWithTimeout<{
        total?: number;
        questions?: Array<{ date_created?: string }>;
      }>(
        `${ML_API_BASE}/questions/search?seller_id=${account.seller_id}&status=UNANSWERED&limit=50&api_version=4`,
        token
      );

      if (questionsRes.ok && questionsRes.data) {
        const list = questionsRes.data.questions ?? [];
        unansweredTotal += Number(questionsRes.data.total ?? list.length);
        for (const q of list) {
          if (q.date_created) {
            const createdMs = Date.parse(q.date_created);
            if (!Number.isNaN(createdMs) && createdMs <= fifteenMinAgoMs) {
              overdueQuestionsTotal += 1;
            }
          }
        }
      }
    })
  );

  const summary: MlQuestionsSummary = {
    unansweredQuestionsCount: unansweredTotal,
    overdueQuestionsCount: overdueQuestionsTotal,
  };

  pruneMapIfNeeded(mlQuestionsCache);
  mlQuestionsCache.set(cacheKey, {
    value: summary,
    expiresAt: Date.now() + ML_ENRICHMENT_CACHE_TTL_MS,
    generatedAt: new Date().toISOString(),
  });

  return summary;
}

interface RawRpcPayload {
  days_span: number;
  prev_from_date: string;
  prev_to_date: string;
  daily_series: Array<{
    date_key: string;
    date_label: string;
    gross_sales: number;
    net_profit: number;
    orders_count: number;
    units_sold: number;
    prev_gross_sales: number;
    prev_net_profit: number;
    prev_orders_count: number;
  }>;
  top_by_revenue: Array<Record<string, unknown>>;
  top_by_profit: Array<Record<string, unknown>>;
  declining_products: Array<Record<string, unknown>>;
  stockout_alerts: Array<Record<string, unknown>>;
  critical_margin_alerts: Array<Record<string, unknown>>;
  conversion_alerts: Array<Record<string, unknown>>;
  urgent_shipments: Array<Record<string, unknown>>;
  stores: string[];
}

function mapProductRow(
  raw: Record<string, unknown>,
  withDiagnosis = false
): PortfolioProductRow {
  const availableQuantity =
    raw.available_quantity !== null && raw.available_quantity !== undefined
      ? Number(raw.available_quantity)
      : null;
  const listingStatus = raw.listing_status ? String(raw.listing_status) : null;
  const listingVisits = Number(raw.listing_visits || 0);
  const unitsSold = Number(raw.units_sold || 0);
  const prevUnitsSold = Number(raw.prev_units_sold || 0);
  const marginPct = Number(raw.margin_pct || 0);

  const base: PortfolioProductRow = {
    mlbId: String(raw.mlb_id || ""),
    sku: raw.sku ? String(raw.sku) : null,
    title: String(raw.product_title || raw.mlb_id || "Produto"),
    thumbnail: raw.product_thumbnail ? String(raw.product_thumbnail) : null,
    permalink: raw.permalink ? String(raw.permalink) : null,
    ordersCount: Number(raw.orders_count || 0),
    unitsSold,
    grossSales: roundCurrency(Number(raw.gross_sales || 0)),
    netProfit: roundCurrency(Number(raw.net_profit || 0)),
    marginPct: roundCurrency(marginPct),
    prevUnitsSold,
    prevGrossSales: roundCurrency(Number(raw.prev_gross_sales || 0)),
    revenueDeltaPct:
      raw.revenue_delta_pct !== null && raw.revenue_delta_pct !== undefined
        ? Number(raw.revenue_delta_pct)
        : null,
    unitsDeltaPct:
      raw.units_delta_pct !== null && raw.units_delta_pct !== undefined
        ? Number(raw.units_delta_pct)
        : null,
    availableQuantity,
    listingStatus,
    dailyVelocity: roundCurrency(Number(raw.daily_velocity || 0)),
    daysOfStock:
      raw.days_of_stock !== null && raw.days_of_stock !== undefined
        ? Number(raw.days_of_stock)
        : null,
  };

  if (withDiagnosis) {
    const diag = diagnoseDecliningProduct({
      availableQuantity,
      listingStatus,
      listingVisits,
      unitsSold,
      prevUnitsSold,
    });
    base.diagnosis = diag.diagnosis;
    base.diagnosisTone = diag.tone;
  }

  return base;
}

/**
 * Fallback computation in TypeScript when the PostgreSQL RPC migration
 * (`20261126090000_create_executive_dashboard_rpc.sql`) hasn't been applied yet.
 * Projects ONLY the minimal columns needed to minimize Supabase egress.
 */
async function computeFallbackFromSupabase(params: {
  ctx: Pick<AuthContext, "userId" | "organizationId">;
  fromDate: string;
  toDate: string;
  selectedStore: string;
}): Promise<{ schemaReady: boolean; payload: RawRpcPayload }> {
  const { ctx, fromDate, toDate, selectedStore } = params;
  const admin = createSupabaseAdminClient();
  const daysSpan = diffDaysInclusive(fromDate, toDate);
  const prevToDate = addDaysToIsoDate(fromDate, -1);
  const prevFromDate = addDaysToIsoDate(prevToDate, -(daysSpan - 1));

  const prevStartIso = `${prevFromDate}T00:00:00.000-03:00`;
  const currStartIso = `${fromDate}T00:00:00.000-03:00`;
  const currEndIso = `${toDate}T23:59:59.999-03:00`;

  const ORDER_COLS =
    "ml_order_id,ml_pack_id,store_name,order_date,shipping_deadline,logistic_type,status,mlb_id,sku,product_title,product_thumbnail,permalink,quantity,gross_sale_amount,net_operational_profit";

  let ordersQuery = applyTenantFilter(
    admin
      .from("ml_sales_orders")
      .select(ORDER_COLS)
      .gte("order_date", prevStartIso)
      .lte("order_date", currEndIso)
      .limit(5000),
    ctx
  );
  if (selectedStore !== "all") {
    ordersQuery = ordersQuery.eq("store_name", selectedStore);
  }

  let urgentShipmentsQuery = applyTenantFilter(
    admin
      .from("ml_sales_orders")
      .select("ml_order_id,ml_pack_id,mlb_id,product_title,shipping_deadline,logistic_type,store_name")
      .eq("status", "paid")
      .not("shipping_deadline", "is", null)
      .lte("shipping_deadline", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .order("shipping_deadline", { ascending: true })
      .limit(8),
    ctx
  );
  if (selectedStore !== "all") {
    urgentShipmentsQuery = urgentShipmentsQuery.eq("store_name", selectedStore);
  }

  const listingsQuery = admin
    .from("my_listings")
    .select("external_id,title,thumbnail_url,permalink,status,available_quantity,visits")
    .eq("platform", "mercadolivre")
    .eq("user_id", ctx.userId)
    .limit(1000);

  const [ordersRes, urgentRes, listingsRes] = await Promise.all([
    ordersQuery,
    urgentShipmentsQuery,
    listingsQuery,
  ]);

  if (isMissingTableError(ordersRes.error)) {
    return {
      schemaReady: false,
      payload: buildEmptyRawRpc(daysSpan, fromDate, prevFromDate, prevToDate),
    };
  }

  const orders = (ordersRes.data ?? []) as Array<Record<string, unknown>>;
  const listings = (listingsRes.data ?? []) as Array<Record<string, unknown>>;
  const urgentRows = (urgentRes.data ?? []) as Array<Record<string, unknown>>;

  const listingsMap = new Map<
    string,
    {
      mlb_id: string;
      title: string;
      thumbnail_url: string | null;
      permalink: string | null;
      listing_status: string;
      available_quantity: number;
      visits: number;
    }
  >();

  for (const l of listings) {
    const mlbId = String(l.external_id || "").trim().toUpperCase();
    if (!mlbId) continue;
    listingsMap.set(mlbId, {
      mlb_id: mlbId,
      title: String(l.title || mlbId),
      thumbnail_url: l.thumbnail_url ? String(l.thumbnail_url) : null,
      permalink: l.permalink ? String(l.permalink) : null,
      listing_status: String(l.status || "active"),
      available_quantity: Number(l.available_quantity || 0),
      visits: Number(l.visits || 0),
    });
  }

  const storeSet = new Set<string>();
  const currDaily = new Map<string, { gross: number; profit: number; orders: number; units: number }>();
  const prevDaily = new Map<string, { gross: number; profit: number; orders: number; units: number }>();

  interface MlbAgg {
    mlb_id: string;
    sku: string | null;
    product_title: string;
    product_thumbnail: string | null;
    permalink: string | null;
    orders_count: number;
    units_sold: number;
    gross_sales: number;
    net_profit: number;
  }

  const currByMlb = new Map<string, MlbAgg>();
  const prevByMlb = new Map<string, MlbAgg>();

  const currStartMs = Date.parse(currStartIso);

  for (const o of orders) {
    if (o.store_name) storeSet.add(String(o.store_name));
    const status = String(o.status || "paid");
    if (isCancelledOrReturned(status)) continue;

    const orderDateStr = String(o.order_date || "");
    const orderMs = Date.parse(orderDateStr);
    const isCurrent = orderMs >= currStartMs;

    const qty = Number(o.quantity || 1);
    const gross = Number(o.gross_sale_amount || 0);
    const netProfit = Number(o.net_operational_profit || 0);

    const { dateKey } = toBrazilDateKeyAndLabel(orderDateStr);
    const dailyMap = isCurrent ? currDaily : prevDaily;
    const dEntry = dailyMap.get(dateKey) ?? { gross: 0, profit: 0, orders: 0, units: 0 };
    dEntry.gross = roundCurrency(dEntry.gross + gross);
    dEntry.profit = roundCurrency(dEntry.profit + netProfit);
    dEntry.orders += 1;
    dEntry.units += qty;
    dailyMap.set(dateKey, dEntry);

    const mlbId = String(o.mlb_id || "").trim().toUpperCase();
    if (mlbId) {
      const mlbMap = isCurrent ? currByMlb : prevByMlb;
      const existing = mlbMap.get(mlbId) ?? {
        mlb_id: mlbId,
        sku: o.sku ? String(o.sku) : null,
        product_title: String(o.product_title || mlbId),
        product_thumbnail: o.product_thumbnail ? String(o.product_thumbnail) : null,
        permalink: o.permalink ? String(o.permalink) : null,
        orders_count: 0,
        units_sold: 0,
        gross_sales: 0,
        net_profit: 0,
      };
      existing.orders_count += 1;
      existing.units_sold += qty;
      existing.gross_sales = roundCurrency(existing.gross_sales + gross);
      existing.net_profit = roundCurrency(existing.net_profit + netProfit);
      if (!existing.sku && o.sku) existing.sku = String(o.sku);
      if (!existing.product_thumbnail && o.product_thumbnail) {
        existing.product_thumbnail = String(o.product_thumbnail);
      }
      mlbMap.set(mlbId, existing);
    }
  }

  const dailySeries: RawRpcPayload["daily_series"] = [];
  for (let i = 0; i < daysSpan; i++) {
    const currKey = addDaysToIsoDate(fromDate, i);
    const prevKey = addDaysToIsoDate(prevFromDate, i);
    const c = currDaily.get(currKey);
    const p = prevDaily.get(prevKey);
    dailySeries.push({
      date_key: currKey,
      date_label: `${currKey.slice(8, 10)}/${currKey.slice(5, 7)}`,
      gross_sales: c?.gross ?? 0,
      net_profit: c?.profit ?? 0,
      orders_count: c?.orders ?? 0,
      units_sold: c?.units ?? 0,
      prev_gross_sales: p?.gross ?? 0,
      prev_net_profit: p?.profit ?? 0,
      prev_orders_count: p?.orders ?? 0,
    });
  }

  const allMlbIds = Array.from(
    new Set<string>([
      ...Array.from(currByMlb.keys()),
      ...Array.from(prevByMlb.keys()),
    ])
  );
  const combined: Array<Record<string, unknown>> = [];

  for (const mlbId of allMlbIds) {
    const c = currByMlb.get(mlbId);
    const p = prevByMlb.get(mlbId);
    const l = listingsMap.get(mlbId);

    const gross = c?.gross_sales ?? 0;
    const netProfit = c?.net_profit ?? 0;
    const units = c?.units_sold ?? 0;
    const prevGross = p?.gross_sales ?? 0;
    const prevUnits = p?.units_sold ?? 0;
    const marginPct = gross > 0 ? roundCurrency((netProfit / gross) * 100) : 0;
    const velocity = roundCurrency(units / daysSpan);
    const avail = l ? l.available_quantity : null;
    const daysOfStock =
      units > 0 && avail !== null && velocity > 0 ? roundCurrency(avail / velocity) : null;

    combined.push({
      mlb_id: mlbId,
      sku: c?.sku ?? p?.sku ?? null,
      product_title: c?.product_title ?? p?.product_title ?? l?.title ?? mlbId,
      product_thumbnail: c?.product_thumbnail ?? p?.product_thumbnail ?? l?.thumbnail_url ?? null,
      permalink: c?.permalink ?? p?.permalink ?? l?.permalink ?? null,
      orders_count: c?.orders_count ?? 0,
      units_sold: units,
      gross_sales: gross,
      net_profit: netProfit,
      margin_pct: marginPct,
      prev_orders_count: p?.orders_count ?? 0,
      prev_units_sold: prevUnits,
      prev_gross_sales: prevGross,
      prev_net_profit: p?.net_profit ?? 0,
      revenue_delta_pct: prevGross > 0 ? roundCurrency(((gross - prevGross) / prevGross) * 100) : null,
      units_delta_pct: prevUnits > 0 ? roundCurrency(((units - prevUnits) / prevUnits) * 100) : null,
      available_quantity: avail,
      listing_status: l?.listing_status ?? null,
      listing_visits: l?.visits ?? 0,
      daily_velocity: velocity,
      days_of_stock: daysOfStock,
    });
  }

  const topByRevenue = [...combined]
    .filter((r) => Number(r.gross_sales) > 0)
    .sort((a, b) => Number(b.gross_sales) - Number(a.gross_sales))
    .slice(0, 8);

  const topByProfit = [...combined]
    .filter((r) => Number(r.gross_sales) > 0)
    .sort((a, b) => Number(b.net_profit) - Number(a.net_profit))
    .slice(0, 8);

  const declining = [...combined]
    .filter((r) => Number(r.prev_units_sold) >= 2 && Number(r.units_sold) < Number(r.prev_units_sold))
    .sort(
      (a, b) =>
        Number(b.prev_gross_sales) -
        Number(b.gross_sales) -
        (Number(a.prev_gross_sales) - Number(a.gross_sales))
    )
    .slice(0, 8);

  const stockoutAlerts = [...combined]
    .filter(
      (r) =>
        Number(r.units_sold) >= 2 &&
        r.available_quantity !== null &&
        r.days_of_stock !== null &&
        Number(r.days_of_stock) < 7 &&
        (r.listing_status === null || r.listing_status === "active")
    )
    .sort((a, b) => Number(a.days_of_stock) - Number(b.days_of_stock))
    .slice(0, 6);

  const criticalMarginAlerts = [...combined]
    .filter((r) => Number(r.gross_sales) > 0 && Number(r.margin_pct) < CRITICAL_MARGIN_THRESHOLD_PCT)
    .sort((a, b) => Number(a.net_profit) - Number(b.net_profit))
    .slice(0, 6);

  const conversionAlerts: Array<Record<string, unknown>> = [];
  for (const l of Array.from(listingsMap.values())) {
    if (l.listing_status !== "active" || l.visits < 80) continue;
    const ordersCount = currByMlb.get(l.mlb_id)?.orders_count ?? 0;
    const convPct = (ordersCount / Math.max(l.visits, 1)) * 100;
    if (ordersCount === 0 || convPct < 0.6) {
      conversionAlerts.push({
        mlb_id: l.mlb_id,
        product_title: l.title,
        product_thumbnail: l.thumbnail_url,
        permalink: l.permalink,
        listing_visits: l.visits,
        orders_count: ordersCount,
        available_quantity: l.available_quantity,
      });
    }
  }
  conversionAlerts.sort((a, b) => Number(b.listing_visits) - Number(a.listing_visits));

  return {
    schemaReady: true,
    payload: {
      days_span: daysSpan,
      prev_from_date: prevFromDate,
      prev_to_date: prevToDate,
      daily_series: dailySeries,
      top_by_revenue: topByRevenue,
      top_by_profit: topByProfit,
      declining_products: declining,
      stockout_alerts: stockoutAlerts,
      critical_margin_alerts: criticalMarginAlerts,
      conversion_alerts: conversionAlerts.slice(0, 6),
      urgent_shipments: urgentRows,
      stores: Array.from(storeSet).sort(),
    },
  };
}

function buildEmptyRawRpc(
  daysSpan: number,
  fromDate: string,
  prevFromDate: string,
  prevToDate: string
): RawRpcPayload {
  const daily_series: RawRpcPayload["daily_series"] = [];
  for (let i = 0; i < daysSpan; i++) {
    const currKey = addDaysToIsoDate(fromDate, i);
    daily_series.push({
      date_key: currKey,
      date_label: `${currKey.slice(8, 10)}/${currKey.slice(5, 7)}`,
      gross_sales: 0,
      net_profit: 0,
      orders_count: 0,
      units_sold: 0,
      prev_gross_sales: 0,
      prev_net_profit: 0,
      prev_orders_count: 0,
    });
  }
  return {
    days_span: daysSpan,
    prev_from_date: prevFromDate,
    prev_to_date: prevToDate,
    daily_series,
    top_by_revenue: [],
    top_by_profit: [],
    declining_products: [],
    stockout_alerts: [],
    critical_margin_alerts: [],
    conversion_alerts: [],
    urgent_shipments: [],
    stores: [],
  };
}

export async function getExecutiveDashboardData(params: {
  ctx: Pick<AuthContext, "userId" | "organizationId">;
  fromDate: string;
  toDate: string;
  selectedStore: string;
  forceRefresh?: boolean;
}): Promise<ExecutiveDashboardResponse> {
  const { ctx, fromDate, toDate, selectedStore, forceRefresh = false } = params;
  const tenantKey = ctx.organizationId ?? ctx.userId;
  const cacheKey = `${tenantKey}:${fromDate}:${toDate}:${selectedStore}`;

  if (!forceRefresh) {
    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.value,
        cacheMeta: {
          ...cached.value.cacheMeta,
          hit: true,
        },
      };
    }
  }

  const admin = createSupabaseAdminClient();

  const [rpcRes, integrations] = await Promise.all([
    admin.rpc("fn_get_executive_dashboard_metrics", {
      p_organization_id: ctx.organizationId,
      p_user_id: ctx.userId,
      p_from_date: fromDate,
      p_to_date: toDate,
      p_store_name: selectedStore === "all" ? null : selectedStore,
      p_critical_margin_pct: CRITICAL_MARGIN_THRESHOLD_PCT,
    }),
    getMarketplaceIntegrations({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    }),
  ]);

  let usedRpc = false;
  let schemaReady = true;
  let raw: RawRpcPayload;

  if (!rpcRes.error && rpcRes.data) {
    usedRpc = true;
    raw = rpcRes.data as RawRpcPayload;
  } else {
    const fallback = await computeFallbackFromSupabase({
      ctx,
      fromDate,
      toDate,
      selectedStore,
    });
    schemaReady = fallback.schemaReady;
    raw = fallback.payload;
  }

  const questionsSummary = await fetchMlQuestionsSummary({
    ctx,
    accounts: integrations,
    selectedStore,
    forceRefresh,
  });

  const dailySeries: DailyEvolutionPoint[] = (raw.daily_series ?? []).map((d) => ({
    dateKey: d.date_key,
    dateLabel: d.date_label,
    grossSales: roundCurrency(Number(d.gross_sales || 0)),
    netProfit: roundCurrency(Number(d.net_profit || 0)),
    ordersCount: Number(d.orders_count || 0),
    unitsSold: Number(d.units_sold || 0),
    prevGrossSales: roundCurrency(Number(d.prev_gross_sales || 0)),
    prevNetProfit: roundCurrency(Number(d.prev_net_profit || 0)),
    prevOrdersCount: Number(d.prev_orders_count || 0),
  }));

  const nowMs = Date.now();
  const urgentShipments: UrgentShipmentAlertItem[] = (raw.urgent_shipments ?? []).map((u) => {
    const deadline = String(u.shipping_deadline || "");
    const deadlineMs = Date.parse(deadline);
    return {
      mlOrderId: Number(u.ml_order_id),
      mlPackId: u.ml_pack_id != null ? Number(u.ml_pack_id) : null,
      mlbId: String(u.mlb_id || ""),
      title: String(u.product_title || "Pedido"),
      shippingDeadline: deadline,
      logisticType: u.logistic_type ? String(u.logistic_type) : null,
      storeName: String(u.store_name || "Mercado Livre"),
      isOverdue: !Number.isNaN(deadlineMs) && deadlineMs < nowMs,
    };
  });

  const stockoutRisk: StockoutAlertItem[] = (raw.stockout_alerts ?? []).map((s) => ({
    mlbId: String(s.mlb_id || ""),
    sku: s.sku ? String(s.sku) : null,
    title: String(s.product_title || s.mlb_id || "Produto"),
    thumbnail: s.product_thumbnail ? String(s.product_thumbnail) : null,
    permalink: s.permalink ? String(s.permalink) : null,
    availableQuantity: Number(s.available_quantity || 0),
    dailyVelocity: roundCurrency(Number(s.daily_velocity || 0)),
    daysOfStock: roundCurrency(Number(s.days_of_stock || 0)),
    grossSales: roundCurrency(Number(s.gross_sales || 0)),
  }));

  const criticalMargin: CriticalMarginAlertItem[] = (raw.critical_margin_alerts ?? []).map(
    (m) => ({
      mlbId: String(m.mlb_id || ""),
      sku: m.sku ? String(m.sku) : null,
      title: String(m.product_title || m.mlb_id || "Produto"),
      thumbnail: m.product_thumbnail ? String(m.product_thumbnail) : null,
      permalink: m.permalink ? String(m.permalink) : null,
      unitsSold: Number(m.units_sold || 0),
      grossSales: roundCurrency(Number(m.gross_sales || 0)),
      netProfit: roundCurrency(Number(m.net_profit || 0)),
      marginPct: roundCurrency(Number(m.margin_pct || 0)),
    })
  );

  const conversionDrop: ConversionDropAlertItem[] = (raw.conversion_alerts ?? []).map((c) => ({
    mlbId: String(c.mlb_id || ""),
    title: String(c.product_title || c.mlb_id || "Anúncio"),
    thumbnail: c.product_thumbnail ? String(c.product_thumbnail) : null,
    permalink: c.permalink ? String(c.permalink) : null,
    visits: Number(c.listing_visits || 0),
    ordersCount: Number(c.orders_count || 0),
    availableQuantity: Number(c.available_quantity || 0),
  }));

  const actionRadar: ActionRadarPayload = {
    stockoutRisk,
    conversionDrop,
    criticalMargin,
    urgentShipments,
    unansweredQuestionsCount: questionsSummary.unansweredQuestionsCount,
    overdueQuestionsCount: questionsSummary.overdueQuestionsCount,
    criticalMarginThresholdPct: CRITICAL_MARGIN_THRESHOLD_PCT,
  };

  const storeSet = new Set<string>(raw.stores ?? []);
  for (const acc of integrations) {
    if (acc.platform === "mercadolivre" && acc.account_name) {
      storeSet.add(acc.account_name);
    }
  }

  const generatedAt = new Date().toISOString();
  const response: ExecutiveDashboardResponse = {
    success: true,
    schemaReady,
    usedRpc,
    cacheMeta: {
      hit: false,
      generatedAt,
      ttlSeconds: Math.round(DASHBOARD_CACHE_TTL_MS / 1000),
      mlCacheTtlSeconds: Math.round(ML_ENRICHMENT_CACHE_TTL_MS / 1000),
    },
    period: {
      from: fromDate,
      to: toDate,
      prevFrom: raw.prev_from_date,
      prevTo: raw.prev_to_date,
      daysSpan: raw.days_span,
    },
    stores: Array.from(storeSet).sort(),
    selectedStore,
    dailySeries,
    topProductsByRevenue: (raw.top_by_revenue ?? []).map((r) => mapProductRow(r, false)),
    topProductsByProfit: (raw.top_by_profit ?? []).map((r) => mapProductRow(r, false)),
    decliningProducts: (raw.declining_products ?? []).map((r) => mapProductRow(r, true)),
    actionRadar,
  };

  pruneMapIfNeeded(dashboardCache);
  dashboardCache.set(cacheKey, {
    value: response,
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    generatedAt,
  });

  return response;
}
