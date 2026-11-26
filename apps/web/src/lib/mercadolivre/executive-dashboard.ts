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
  AccountReputationHealth,
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
 * - ML live API (reputation, visits, questions): 60 minutes (3600s)
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

const globalForDashboardCache = globalThis as unknown as {
  __erpExecutiveDashboardCache?: Map<string, CacheEntry<ExecutiveDashboardResponse>>;
  __erpMlLiveEnrichmentCache?: Map<string, CacheEntry<MlLiveEnrichment>>;
};

const dashboardCache =
  globalForDashboardCache.__erpExecutiveDashboardCache ??
  new Map<string, CacheEntry<ExecutiveDashboardResponse>>();
globalForDashboardCache.__erpExecutiveDashboardCache = dashboardCache;

const mlLiveCache =
  globalForDashboardCache.__erpMlLiveEnrichmentCache ??
  new Map<string, CacheEntry<MlLiveEnrichment>>();
globalForDashboardCache.__erpMlLiveEnrichmentCache = mlLiveCache;

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

export interface MlLiveEnrichment {
  reputation: AccountReputationHealth;
  currentPeriodVisits: number | null;
  previousPeriodVisits: number | null;
}

function calcDeltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) {
    if (current > 0) return 100;
    return null;
  }
  return roundCurrency(((current - previous) / Math.abs(previous)) * 100);
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
  marginPct: number;
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
  timeoutMs = 5500
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

async function fetchMlLiveEnrichment(params: {
  ctx: Pick<AuthContext, "userId" | "organizationId">;
  accounts: MarketplaceAccountInfo[];
  selectedStore: string;
  daysSpan: number;
  forceRefresh: boolean;
}): Promise<MlLiveEnrichment> {
  const { ctx, accounts, selectedStore, daysSpan, forceRefresh } = params;
  const mlAccounts = accounts.filter(
    (a) =>
      a.platform === "mercadolivre" &&
      a.status !== "reauth_required" &&
      (selectedStore === "all" || a.account_name === selectedStore)
  );

  const fallbackReputation: AccountReputationHealth = {
    levelId: null,
    powerSellerStatus: null,
    claimsRatePct: null,
    claimsCount: 0,
    delayedRatePct: null,
    delayedCount: 0,
    cancellationsRatePct: null,
    cancellationsCount: 0,
    openClaimsCount: 0,
    unansweredQuestionsCount: 0,
    overdueQuestionsCount: 0,
    accountName: mlAccounts[0]?.account_name ?? null,
    source: mlAccounts.length > 0 ? "db_fallback" : "no_account",
    lastSyncedAt: null,
  };

  if (mlAccounts.length === 0) {
    return {
      reputation: fallbackReputation,
      currentPeriodVisits: null,
      previousPeriodVisits: null,
    };
  }

  const tenantKey = ctx.organizationId ?? ctx.userId;
  const cacheKey = `${tenantKey}:${selectedStore}:${Math.min(daysSpan, 60)}`;
  if (!forceRefresh) {
    const cached = mlLiveCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  // Query at most 3 connected accounts to stay lightweight & rate-limit safe
  const accountsToQuery = mlAccounts.slice(0, 3);
  const windowDays = Math.min(Math.max(daysSpan * 2, 2), 90);

  let primaryLevelId: string | null = null;
  let primaryPowerSeller: string | null = null;
  let primaryAccountName: string | null = accountsToQuery[0]?.account_name ?? null;
  let claimsRateSum = 0;
  let claimsRateCount = 0;
  let claimsCountTotal = 0;
  let delayedRateSum = 0;
  let delayedRateCount = 0;
  let delayedCountTotal = 0;
  let cancelRateSum = 0;
  let cancelRateCount = 0;
  let cancelCountTotal = 0;
  let unansweredTotal = 0;
  let overdueQuestionsTotal = 0;
  let currentVisitsTotal = 0;
  let previousVisitsTotal = 0;
  let gotAnyLiveVisits = false;
  let gotAnyLiveReputation = false;

  const fifteenMinAgoMs = Date.now() - 15 * 60 * 1000;

  await Promise.all(
    accountsToQuery.map(async (account) => {
      const token = await getActiveMarketplaceToken(
        "mercadolivre",
        { userId: ctx.userId, organizationId: ctx.organizationId },
        account.seller_id
      ).catch(() => null);

      if (!token) return;

      const [userRes, questionsRes, visitsRes] = await Promise.all([
        fetchJsonWithTimeout<{
          nickname?: string;
          seller_reputation?: {
            level_id?: string | null;
            power_seller_status?: string | null;
            metrics?: {
              claims?: { rate?: number; value?: number };
              delayed_handling_time?: { rate?: number; value?: number };
              cancellations?: { rate?: number; value?: number };
            };
          };
        }>(`${ML_API_BASE}/users/${account.seller_id}`, token),
        fetchJsonWithTimeout<{
          total?: number;
          questions?: Array<{ date_created?: string }>;
        }>(
          `${ML_API_BASE}/questions/search?seller_id=${account.seller_id}&status=UNANSWERED&limit=50&api_version=4`,
          token
        ),
        fetchJsonWithTimeout<{
          results?: Array<{ date?: string; total?: number }>;
        }>(
          `${ML_API_BASE}/users/${account.seller_id}/items_visits/time_window?last=${windowDays}&unit=day`,
          token
        ),
      ]);

      if (userRes.ok && userRes.data?.seller_reputation) {
        gotAnyLiveReputation = true;
        const rep = userRes.data.seller_reputation;
        if (!primaryLevelId && rep.level_id) primaryLevelId = rep.level_id;
        if (!primaryPowerSeller && rep.power_seller_status) {
          primaryPowerSeller = rep.power_seller_status;
        }
        if (userRes.data.nickname && !primaryAccountName) {
          primaryAccountName = userRes.data.nickname;
        }

        const metrics = rep.metrics;
        if (metrics?.claims) {
          if (typeof metrics.claims.rate === "number") {
            claimsRateSum += metrics.claims.rate * 100;
            claimsRateCount += 1;
          }
          claimsCountTotal += Number(metrics.claims.value || 0);
        }
        if (metrics?.delayed_handling_time) {
          if (typeof metrics.delayed_handling_time.rate === "number") {
            delayedRateSum += metrics.delayed_handling_time.rate * 100;
            delayedRateCount += 1;
          }
          delayedCountTotal += Number(metrics.delayed_handling_time.value || 0);
        }
        if (metrics?.cancellations) {
          if (typeof metrics.cancellations.rate === "number") {
            cancelRateSum += metrics.cancellations.rate * 100;
            cancelRateCount += 1;
          }
          cancelCountTotal += Number(metrics.cancellations.value || 0);
        }
      }

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

      if (visitsRes.ok && Array.isArray(visitsRes.data?.results) && visitsRes.data.results.length > 0) {
        gotAnyLiveVisits = true;
        const results = visitsRes.data.results;
        const len = results.length;
        const currSlice = results.slice(Math.max(len - daysSpan, 0));
        const prevSlice = results.slice(
          Math.max(len - daysSpan * 2, 0),
          Math.max(len - daysSpan, 0)
        );
        for (const pt of currSlice) {
          currentVisitsTotal += Number(pt.total || 0);
        }
        for (const pt of prevSlice) {
          previousVisitsTotal += Number(pt.total || 0);
        }
      }
    })
  );

  const enrichment: MlLiveEnrichment = {
    reputation: {
      levelId: primaryLevelId,
      powerSellerStatus: primaryPowerSeller,
      claimsRatePct:
        claimsRateCount > 0 ? roundCurrency(claimsRateSum / claimsRateCount) : null,
      claimsCount: claimsCountTotal,
      delayedRatePct:
        delayedRateCount > 0 ? roundCurrency(delayedRateSum / delayedRateCount) : null,
      delayedCount: delayedCountTotal,
      cancellationsRatePct:
        cancelRateCount > 0 ? roundCurrency(cancelRateSum / cancelRateCount) : null,
      cancellationsCount: cancelCountTotal,
      openClaimsCount: claimsCountTotal,
      unansweredQuestionsCount: unansweredTotal,
      overdueQuestionsCount: overdueQuestionsTotal,
      accountName: primaryAccountName,
      source: gotAnyLiveReputation ? "ml_live" : "db_fallback",
      lastSyncedAt: new Date().toISOString(),
    },
    currentPeriodVisits: gotAnyLiveVisits ? currentVisitsTotal : null,
    previousPeriodVisits: gotAnyLiveVisits ? previousVisitsTotal : null,
  };

  pruneMapIfNeeded(mlLiveCache);
  mlLiveCache.set(cacheKey, {
    value: enrichment,
    expiresAt: Date.now() + ML_ENRICHMENT_CACHE_TTL_MS,
    generatedAt: new Date().toISOString(),
  });

  return enrichment;
}

interface RawRpcPayload {
  days_span: number;
  prev_from_date: string;
  prev_to_date: string;
  current_kpis: {
    valid_orders_count: number;
    cancelled_orders_count: number;
    units_sold: number;
    gross_sales: number;
    net_profit: number;
    seller_transfer: number;
    ml_commission: number;
    ml_shipping: number;
    ml_promo_rebate: number;
    tax_total: number;
    operational_costs: number;
  };
  previous_kpis: {
    valid_orders_count: number;
    cancelled_orders_count: number;
    units_sold: number;
    gross_sales: number;
    net_profit: number;
    seller_transfer: number;
    ml_commission: number;
    ml_shipping: number;
    ml_promo_rebate: number;
    tax_total: number;
    operational_costs: number;
  };
  listings_totals: {
    active_listings_count: number;
    total_listing_visits: number;
  };
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
      marginPct,
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
    "ml_order_id,ml_pack_id,store_name,order_date,shipping_deadline,logistic_type,status,mlb_id,sku,product_title,product_thumbnail,permalink,quantity,gross_sale_amount,ml_commission_amount,ml_shipping_cost,ml_promo_rebate,tax_amount,cost_material,cost_packaging,cost_logistics,cost_printing,cost_accessories_kit,seller_transfer_profit,net_operational_profit";

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
      payload: buildEmptyRawRpc(daysSpan, fromDate, toDate, prevFromDate, prevToDate),
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

  let activeListingsCount = 0;
  let totalListingVisits = 0;

  for (const l of listings) {
    const mlbId = String(l.external_id || "").trim().toUpperCase();
    if (!mlbId) continue;
    const status = String(l.status || "active");
    const visits = Number(l.visits || 0);
    if (status === "active") {
      activeListingsCount += 1;
      totalListingVisits += visits;
    }
    listingsMap.set(mlbId, {
      mlb_id: mlbId,
      title: String(l.title || mlbId),
      thumbnail_url: l.thumbnail_url ? String(l.thumbnail_url) : null,
      permalink: l.permalink ? String(l.permalink) : null,
      listing_status: status,
      available_quantity: Number(l.available_quantity || 0),
      visits,
    });
  }

  const emptyKpi = () => ({
    valid_orders_count: 0,
    cancelled_orders_count: 0,
    units_sold: 0,
    gross_sales: 0,
    net_profit: 0,
    seller_transfer: 0,
    ml_commission: 0,
    ml_shipping: 0,
    ml_promo_rebate: 0,
    tax_total: 0,
    operational_costs: 0,
  });

  const currKpis = emptyKpi();
  const prevKpis = emptyKpi();
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
    const orderDateStr = String(o.order_date || "");
    const orderMs = Date.parse(orderDateStr);
    const isCurrent = orderMs >= currStartMs;
    const status = String(o.status || "paid");
    const targetKpi = isCurrent ? currKpis : prevKpis;

    if (isCancelledOrReturned(status)) {
      targetKpi.cancelled_orders_count += 1;
      continue;
    }

    const qty = Number(o.quantity || 1);
    const gross = Number(o.gross_sale_amount || 0);
    const comm = Number(o.ml_commission_amount || 0);
    const ship = Number(o.ml_shipping_cost || 0);
    const rebate = Number(o.ml_promo_rebate || 0);
    const tax = Number(o.tax_amount || 0);
    const opCosts =
      Number(o.cost_material || 0) +
      Number(o.cost_packaging || 0) +
      Number(o.cost_logistics || 0) +
      Number(o.cost_printing || 0) +
      Number(o.cost_accessories_kit || 0);
    const transfer = Number(o.seller_transfer_profit || 0);
    const netProfit = Number(o.net_operational_profit || 0);

    targetKpi.valid_orders_count += 1;
    targetKpi.units_sold += qty;
    targetKpi.gross_sales = roundCurrency(targetKpi.gross_sales + gross);
    targetKpi.net_profit = roundCurrency(targetKpi.net_profit + netProfit);
    targetKpi.seller_transfer = roundCurrency(targetKpi.seller_transfer + transfer);
    targetKpi.ml_commission = roundCurrency(targetKpi.ml_commission + comm);
    targetKpi.ml_shipping = roundCurrency(targetKpi.ml_shipping + ship);
    targetKpi.ml_promo_rebate = roundCurrency(targetKpi.ml_promo_rebate + rebate);
    targetKpi.tax_total = roundCurrency(targetKpi.tax_total + tax);
    targetKpi.operational_costs = roundCurrency(targetKpi.operational_costs + opCosts);

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
      current_kpis: currKpis,
      previous_kpis: prevKpis,
      listings_totals: {
        active_listings_count: activeListingsCount,
        total_listing_visits: totalListingVisits,
      },
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
  _toDate: string,
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
  const zeroKpis = {
    valid_orders_count: 0,
    cancelled_orders_count: 0,
    units_sold: 0,
    gross_sales: 0,
    net_profit: 0,
    seller_transfer: 0,
    ml_commission: 0,
    ml_shipping: 0,
    ml_promo_rebate: 0,
    tax_total: 0,
    operational_costs: 0,
  };
  return {
    days_span: daysSpan,
    prev_from_date: prevFromDate,
    prev_to_date: prevToDate,
    current_kpis: zeroKpis,
    previous_kpis: zeroKpis,
    listings_totals: { active_listings_count: 0, total_listing_visits: 0 },
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
  const daysSpan = diffDaysInclusive(fromDate, toDate);

  // Run DB aggregation + integrations list in parallel
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

  // Enrich with cached ML Live API (60 min TTL)
  const mlLive = await fetchMlLiveEnrichment({
    ctx,
    accounts: integrations,
    selectedStore,
    daysSpan,
    forceRefresh,
  });

  const curr = raw.current_kpis;
  const prev = raw.previous_kpis;

  const grossSales = roundCurrency(Number(curr.gross_sales || 0));
  const prevGrossSales = roundCurrency(Number(prev.gross_sales || 0));

  const netProfit = roundCurrency(Number(curr.net_profit || 0));
  const prevNetProfit = roundCurrency(Number(prev.net_profit || 0));

  const validOrders = Number(curr.valid_orders_count || 0);
  const prevValidOrders = Number(prev.valid_orders_count || 0);

  const marginPct = grossSales > 0 ? roundCurrency((netProfit / grossSales) * 100) : 0;
  const prevMarginPct =
    prevGrossSales > 0 ? roundCurrency((prevNetProfit / prevGrossSales) * 100) : 0;

  const avgTicket = validOrders > 0 ? roundCurrency(grossSales / validOrders) : 0;
  const prevAvgTicket =
    prevValidOrders > 0 ? roundCurrency(prevGrossSales / prevValidOrders) : 0;

  // Visits & conversion rate (prefer live ML time-window visits; fallback to DB listings visits)
  const dbVisits = Number(raw.listings_totals?.total_listing_visits || 0);
  const totalVisits =
    mlLive.currentPeriodVisits !== null ? mlLive.currentPeriodVisits : dbVisits;
  const prevTotalVisits =
    mlLive.previousPeriodVisits !== null ? mlLive.previousPeriodVisits : dbVisits;
  const visitsSource: "ml_live" | "db_fallback" =
    mlLive.currentPeriodVisits !== null ? "ml_live" : "db_fallback";

  const conversionRate =
    totalVisits > 0 ? roundCurrency((validOrders / totalVisits) * 100) : 0;
  const prevConversionRate =
    prevTotalVisits > 0 ? roundCurrency((prevValidOrders / prevTotalVisits) * 100) : 0;

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

  const grossSparkline = dailySeries.map((d) => d.grossSales);
  const profitSparkline = dailySeries.map((d) => d.netProfit);
  const ticketSparkline = dailySeries.map((d) =>
    d.ordersCount > 0 ? roundCurrency(d.grossSales / d.ordersCount) : 0
  );
  const ordersSparkline = dailySeries.map((d) => d.ordersCount);

  const mlFeesAndShippingTotal = roundCurrency(
    Number(curr.ml_commission || 0) +
      Number(curr.ml_shipping || 0) -
      Number(curr.ml_promo_rebate || 0)
  );

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
    unansweredQuestionsCount: mlLive.reputation.unansweredQuestionsCount,
    overdueQuestionsCount: mlLive.reputation.overdueQuestionsCount,
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
    kpis: {
      grossSales: {
        value: grossSales,
        previousValue: prevGrossSales,
        deltaPct: calcDeltaPct(grossSales, prevGrossSales),
        sparkline: grossSparkline,
        validOrdersCount: validOrders,
        previousValidOrdersCount: prevValidOrders,
        cancelledOrdersCount: Number(curr.cancelled_orders_count || 0),
        unitsSold: Number(curr.units_sold || 0),
      },
      netProfit: {
        value: netProfit,
        previousValue: prevNetProfit,
        deltaPct: calcDeltaPct(netProfit, prevNetProfit),
        sparkline: profitSparkline,
        marginPct,
        previousMarginPct: prevMarginPct,
        marginDeltaPts: roundCurrency(marginPct - prevMarginPct),
        mlFeesAndShippingTotal,
        taxTotal: roundCurrency(Number(curr.tax_total || 0)),
        operationalCostsTotal: roundCurrency(Number(curr.operational_costs || 0)),
      },
      averageTicket: {
        value: avgTicket,
        previousValue: prevAvgTicket,
        deltaPct: calcDeltaPct(avgTicket, prevAvgTicket),
        sparkline: ticketSparkline,
      },
      conversionRate: {
        value: conversionRate,
        previousValue: prevConversionRate,
        deltaPct: calcDeltaPct(conversionRate, prevConversionRate),
        sparkline: ordersSparkline,
        totalVisits,
        previousTotalVisits: prevTotalVisits,
        visitsSource,
      },
      reputation: mlLive.reputation,
    },
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
