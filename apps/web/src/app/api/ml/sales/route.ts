import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getMarketplaceIntegrations } from "@/lib/services/marketplaceIntegrations";
import {
  computeReturnsAndCancellationsAnalytics,
  computeSalesDashboardAnalytics,
  computeSalesStatusCounts,
  matchesSalesStatusFilter,
  toBrazilDateKeyAndLabel,
} from "@/lib/mercadolivre/sales-analytics";
import {
  applyTenantFilter,
  isMissingColumnError,
  isMissingTableError,
} from "@/lib/mercadolivre/tenant-scope";
import type {
  MlConnectedAccountOption,
  MlSaleOrder,
  MlSalesDashboardResponse,
  ProductCostTemplate,
  SalesAnalysisMode,
  Seller,
} from "@/types/ml-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_PAGE_SIZE = 1000;
const MAX_FETCH_ROWS = 20000;

function normalizeOrderRow(row: Record<string, unknown>): MlSaleOrder {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    user_id: row.user_id ? String(row.user_id) : null,
    ml_order_id: Number(row.ml_order_id),
    ml_pack_id: row.ml_pack_id != null ? Number(row.ml_pack_id) : null,
    ml_shipment_id: row.ml_shipment_id != null ? Number(row.ml_shipment_id) : null,
    ml_seller_id: row.ml_seller_id ? String(row.ml_seller_id) : null,
    store_name: String(row.store_name || "Mercado Livre"),
    order_date: String(row.order_date),
    shipping_deadline: row.shipping_deadline ? String(row.shipping_deadline) : null,
    shipped_at: row.shipped_at ? String(row.shipped_at) : null,
    api_shipped_at: row.api_shipped_at ? String(row.api_shipped_at) : null,
    shipped_at_manual: Boolean(row.shipped_at_manual),
    delivered_at: row.delivered_at ? String(row.delivered_at) : null,
    logistic_type: row.logistic_type ? String(row.logistic_type) : null,
    status: (row.status as MlSaleOrder["status"]) || "paid",
    cancellation_reason: row.cancellation_reason ? String(row.cancellation_reason) : null,
    mlb_id: String(row.mlb_id || ""),
    sku: row.sku ? String(row.sku) : null,
    product_title: String(row.product_title || ""),
    product_thumbnail: row.product_thumbnail ? String(row.product_thumbnail) : null,
    permalink: row.permalink ? String(row.permalink) : null,
    quantity: Number(row.quantity || 1),
    buyer_name: String(row.buyer_name || "Comprador"),
    buyer_document: row.buyer_document ? String(row.buyer_document) : null,
    is_business_buyer: Boolean(row.is_business_buyer),
    assigned_seller_id: row.assigned_seller_id ? String(row.assigned_seller_id) : null,
    verified_at: row.verified_at ? String(row.verified_at) : null,
    costs_manually_edited: Boolean(row.costs_manually_edited),
    cost_snapshot_locked: Boolean(row.cost_snapshot_locked),
    cost_snapshot_locked_at: row.cost_snapshot_locked_at ? String(row.cost_snapshot_locked_at) : null,
    cost_snapshot_source: row.cost_snapshot_source ? String(row.cost_snapshot_source) : null,
    cost_lot_summary: Array.isArray(row.cost_lot_summary)
      ? (row.cost_lot_summary as MlSaleOrder["cost_lot_summary"])
      : null,
    gross_sale_amount: Number(row.gross_sale_amount || 0),
    ml_commission_pct: Number(row.ml_commission_pct || 0),
    ml_commission_amount: Number(row.ml_commission_amount || 0),
    ml_shipping_cost: Number(row.ml_shipping_cost || 0),
    ml_promo_rebate: Number(row.ml_promo_rebate || 0),
    mp_net_released: Number(row.mp_net_released || 0),
    mp_release_date: row.mp_release_date ? String(row.mp_release_date) : null,
    mp_release_status: row.mp_release_status ? String(row.mp_release_status) : null,
    tax_pct: Number(row.tax_pct || 0),
    tax_amount: Number(row.tax_amount || 0),
    cost_material: Number(row.cost_material || 0),
    cost_packaging: Number(row.cost_packaging || 0),
    cost_logistics: Number(row.cost_logistics || 0),
    cost_printing: Number(row.cost_printing || 0),
    cost_accessories_kit: Number(row.cost_accessories_kit || 0),
    seller_transfer_profit: Number(row.seller_transfer_profit || 0),
    net_operational_profit: Number(row.net_operational_profit || 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/**
 * Pagina de 1.000 em 1.000 linhas no PostgREST para garantir que filtros por Mês, Ano
 * e "Todas as Vendas" nunca sejam truncados pelo limite padrão do Supabase.
 */
async function fetchPaginatedOrders(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;
  analysisMode: SalesAnalysisMode;
  isAllPeriod: boolean;
  isoStart: string;
  isoEnd: string;
}): Promise<{ data: Array<Record<string, unknown>> | null; error: { code?: string; message?: string } | null }> {
  const { admin, ctx, analysisMode, isAllPeriod, isoStart, isoEnd } = params;
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;

  while (rows.length < MAX_FETCH_ROWS) {
    let baseQuery = admin.from("ml_sales_orders").select("*");

    if (analysisMode === "shipping_date") {
      baseQuery = baseQuery.not("shipped_at", "is", null);
      if (!isAllPeriod) {
        baseQuery = baseQuery.gte("shipped_at", isoStart).lte("shipped_at", isoEnd);
      }
      baseQuery = baseQuery.order("shipped_at", { ascending: false });
    } else {
      if (!isAllPeriod) {
        baseQuery = baseQuery.gte("order_date", isoStart).lte("order_date", isoEnd);
      }
      baseQuery = baseQuery.order("order_date", { ascending: false });
    }

    const scopedQuery = applyTenantFilter(baseQuery, ctx).range(
      offset,
      offset + SUPABASE_PAGE_SIZE - 1
    );

    const { data, error } = await scopedQuery;
    if (error) {
      return { data: null, error };
    }

    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) {
      break;
    }
    offset += SUPABASE_PAGE_SIZE;
  }

  return { data: rows, error: null };
}

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Não autenticado." },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const periodParam = searchParams.get("period");
  const isAllPeriod = periodParam === "all" || searchParams.get("all") === "true";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const sellerFilter = searchParams.get("seller") || "all";
  const statusFilter = searchParams.get("status") || "all";
  const storeFilter = searchParams.get("store") || "all";
  const analysisMode: SalesAnalysisMode =
    searchParams.get("analysisBy") === "shipping_date" ? "shipping_date" : "order_date";
  const searchQuery = (searchParams.get("q") || "").trim().replace(/^#+/, "").toLowerCase();

  const now = new Date();
  const todayBr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const currentYear = Number(todayBr.slice(0, 4));

  const fromDate = fromParam && fromParam.length >= 10 ? fromParam.slice(0, 10) : todayBr;
  const toDate = toParam && toParam.length >= 10 ? toParam.slice(0, 10) : todayBr;

  const isoStart = `${fromDate}T00:00:00.000-03:00`;
  const isoEnd = `${toDate}T23:59:59.999-03:00`;

  const admin = createSupabaseAdminClient();

  const integrations = await getMarketplaceIntegrations({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });

  const accounts: MlConnectedAccountOption[] = integrations
    .filter((i) => i.platform === "mercadolivre")
    .map((i) => ({
      id: i.id,
      seller_id: i.seller_id,
      account_name: i.account_name,
      status: i.status,
    }));

  const pendingShipmentCountQuery = applyTenantFilter(
    admin
      .from("ml_sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid"),
    ctx
  );

  const backfillCountQuery = applyTenantFilter(
    admin
      .from("ml_sales_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["shipped", "delivered"])
      .is("shipped_at", null),
    ctx
  );

  const manualSchemaProbeQuery = applyTenantFilter(
    admin.from("ml_sales_orders").select("shipped_at_manual, api_shipped_at").limit(1),
    ctx
  );

  const oldestOrderQuery = applyTenantFilter(
    admin
      .from("ml_sales_orders")
      .select("order_date")
      .order("order_date", { ascending: true })
      .limit(1),
    ctx
  );

  const [ordersRes, sellersRes, templatesRes, pendingRes, backfillRes, manualProbeRes, oldestRes] =
    await Promise.all([
      fetchPaginatedOrders({
        admin,
        ctx,
        analysisMode,
        isAllPeriod,
        isoStart,
        isoEnd,
      }),
      applyTenantFilter(
        admin.from("sellers").select("*").order("name", { ascending: true }),
        ctx
      ),
      applyTenantFilter(
        admin
          .from("product_cost_templates")
          .select("*")
          .order("updated_at", { ascending: false }),
        ctx
      ),
      pendingShipmentCountQuery,
      backfillCountQuery,
      manualSchemaProbeQuery,
      oldestOrderQuery,
    ]);

  if (
    isMissingTableError(ordersRes.error) ||
    isMissingTableError(sellersRes.error) ||
    isMissingTableError(templatesRes.error)
  ) {
    const emptyAnalytics = computeSalesDashboardAnalytics({
      filteredOrders: [],
      sellers: [],
      analysisMode,
    });
    const emptyReturns = computeReturnsAndCancellationsAnalytics({
      scopeOrders: [],
      sellers: [],
      analysisMode,
    });
    const emptyResponse: MlSalesDashboardResponse = {
      success: true,
      schemaReady: false,
      shippingDateSchemaReady: false,
      manualShippingSchemaReady: false,
      analysisMode,
      periodMode: isAllPeriod ? "all" : "range",
      availableYears: [currentYear, currentYear - 1, currentYear - 2],
      pendingShipmentCount: 0,
      backfillMissingShippedAtCount: 0,
      orders: [],
      sellers: [],
      templates: [],
      accounts,
      stores: accounts.map((a) => a.account_name),
      sellerOrderCounts: {},
      unassignedCount: 0,
      statusCounts: computeSalesStatusCounts([]),
      returnsAnalytics: emptyReturns,
      ...emptyAnalytics,
    };
    return NextResponse.json(emptyResponse);
  }

  const shippingDateSchemaReady =
    !isMissingColumnError(ordersRes.error, "shipped_at") &&
    !isMissingColumnError(backfillRes.error, "shipped_at");

  const manualShippingSchemaReady =
    !isMissingColumnError(manualProbeRes.error, "shipped_at_manual") &&
    !isMissingColumnError(manualProbeRes.error, "api_shipped_at");

  const sellers: Seller[] = ((sellersRes.data ?? []) as Array<Record<string, unknown>>).map(
    (s) => ({
      id: String(s.id),
      organization_id: s.organization_id ? String(s.organization_id) : null,
      user_id: s.user_id ? String(s.user_id) : null,
      name: String(s.name),
      color_hex: String(s.color_hex || "#0284C7"),
      commission_pct: Number(s.commission_pct ?? 100),
      active: Boolean(s.active),
      created_at: String(s.created_at),
      updated_at: String(s.updated_at),
    })
  );

  const templates: ProductCostTemplate[] = (
    (templatesRes.data ?? []) as Array<Record<string, unknown>>
  ).map((t) => ({
    id: String(t.id),
    organization_id: t.organization_id ? String(t.organization_id) : null,
    user_id: t.user_id ? String(t.user_id) : null,
    mlb_id: String(t.mlb_id),
    sku: t.sku ? String(t.sku) : null,
    material_cost: Number(t.material_cost || 0),
    packaging_cost: Number(t.packaging_cost || 0),
    logistics_cost: Number(t.logistics_cost || 0),
    printing_cost: Number(t.printing_cost || 0),
    accessories_kit_cost: Number(t.accessories_kit_cost || 0),
    default_tax_pct: Number(t.default_tax_pct ?? 4),
    default_seller_id: t.default_seller_id ? String(t.default_seller_id) : null,
    created_at: String(t.created_at),
    updated_at: String(t.updated_at),
  }));

  const pendingShipmentCount = pendingRes.count ?? 0;
  const backfillMissingShippedAtCount = shippingDateSchemaReady ? backfillRes.count ?? 0 : 0;

  if (ordersRes.error && isMissingColumnError(ordersRes.error, "shipped_at")) {
    const emptyAnalytics = computeSalesDashboardAnalytics({
      filteredOrders: [],
      sellers,
      analysisMode,
    });
    const emptyReturns = computeReturnsAndCancellationsAnalytics({
      scopeOrders: [],
      sellers,
      analysisMode,
    });
    const missingColPayload: MlSalesDashboardResponse = {
      success: true,
      schemaReady: true,
      shippingDateSchemaReady: false,
      manualShippingSchemaReady: false,
      analysisMode,
      periodMode: isAllPeriod ? "all" : "range",
      availableYears: [currentYear, currentYear - 1, currentYear - 2],
      pendingShipmentCount,
      backfillMissingShippedAtCount: 0,
      orders: [],
      sellers,
      templates,
      accounts,
      stores: accounts.map((a) => a.account_name),
      sellerOrderCounts: {},
      unassignedCount: 0,
      statusCounts: computeSalesStatusCounts([]),
      returnsAnalytics: emptyReturns,
      ...emptyAnalytics,
    };
    return NextResponse.json(missingColPayload);
  }

  if (ordersRes.error) {
    return NextResponse.json(
      { success: false, error: ordersRes.error.message || "Erro ao consultar vendas." },
      { status: 500 }
    );
  }

  const allPeriodOrders = ((ordersRes.data ?? []) as Array<Record<string, unknown>>).map(
    normalizeOrderRow
  );

  const yearsSet = new Set<number>([currentYear, currentYear - 1, currentYear - 2]);
  const oldestRows = (oldestRes.data ?? []) as Array<{ order_date?: string }>;
  if (oldestRows[0]?.order_date) {
    const minYear = Number(toBrazilDateKeyAndLabel(String(oldestRows[0].order_date)).dateKey.slice(0, 4));
    if (Number.isFinite(minYear) && minYear >= 2018 && minYear <= currentYear) {
      for (let yr = currentYear; yr >= minYear; yr--) {
        yearsSet.add(yr);
      }
    }
  }
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  const storeSet = new Set<string>(accounts.map((a) => a.account_name));
  for (const o of allPeriodOrders) {
    if (o.store_name) storeSet.add(o.store_name);
  }

  const storeAndSearchFiltered = allPeriodOrders.filter((o) => {
    if (storeFilter !== "all" && o.store_name !== storeFilter) return false;

    if (searchQuery) {
      const hay = `${o.ml_pack_id || ""} ${o.ml_order_id} ${o.mlb_id} ${o.sku || ""} ${o.product_title} ${o.buyer_name} ${o.buyer_document || ""} ${o.cancellation_reason || ""}`.toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }

    return true;
  });

  const scopeOrdersBeforeStatus = storeAndSearchFiltered.filter((o) => {
    if (sellerFilter === "all") return true;
    if (sellerFilter === "unassigned") return !o.assigned_seller_id;
    return o.assigned_seller_id === sellerFilter;
  });

  const statusCounts = computeSalesStatusCounts(scopeOrdersBeforeStatus);
  const returnsAnalytics = computeReturnsAndCancellationsAnalytics({
    scopeOrders: scopeOrdersBeforeStatus,
    sellers,
    analysisMode,
  });

  const baseFilteredForPills = storeAndSearchFiltered.filter((o) =>
    matchesSalesStatusFilter(o, statusFilter)
  );

  const sellerOrderCounts: Record<string, number> = {};
  let unassignedCount = 0;

  for (const o of baseFilteredForPills) {
    if (!o.assigned_seller_id) {
      unassignedCount += 1;
    } else {
      sellerOrderCounts[o.assigned_seller_id] =
        (sellerOrderCounts[o.assigned_seller_id] ?? 0) + 1;
    }
  }

  const filteredOrders = baseFilteredForPills.filter((o) => {
    if (sellerFilter === "all") return true;
    if (sellerFilter === "unassigned") return !o.assigned_seller_id;
    return o.assigned_seller_id === sellerFilter;
  });

  const analytics = computeSalesDashboardAnalytics({
    filteredOrders,
    periodOrdersForSellerCards:
      sellerFilter === "all" || sellerFilter === "unassigned"
        ? baseFilteredForPills
        : filteredOrders,
    sellers,
    analysisMode,
  });

  const payload: MlSalesDashboardResponse = {
    success: true,
    schemaReady: true,
    shippingDateSchemaReady,
    manualShippingSchemaReady,
    analysisMode,
    periodMode: isAllPeriod ? "all" : "range",
    availableYears,
    pendingShipmentCount,
    backfillMissingShippedAtCount,
    orders: filteredOrders,
    sellers,
    templates,
    accounts,
    stores: Array.from(storeSet),
    sellerOrderCounts,
    unassignedCount,
    statusCounts,
    returnsAnalytics,
    ...analytics,
  };

  return NextResponse.json(payload);
}
