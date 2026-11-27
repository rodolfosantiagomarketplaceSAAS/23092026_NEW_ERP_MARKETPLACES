import type {
  DailyClosingRow,
  MlProductReturnRankingRow,
  MlReturnReasonSummaryRow,
  MlReturnsAnalyticsSummary,
  MlSaleOrder,
  MlSalesStatusCounts,
  MlSalesSummaryKpis,
  MlSellerLossSummaryRow,
  SalesAnalysisMode,
  SalesStatusFilter,
  Seller,
  SellerTransferSummary,
} from "../../types/ml-sales";

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isCancelledOrReturned(status: string): boolean {
  return status === "cancelled" || status === "returned";
}

export function matchesSalesStatusFilter(
  order: Pick<MlSaleOrder, "status" | "verified_at">,
  statusFilter: SalesStatusFilter | string
): boolean {
  switch (statusFilter) {
    case "valid":
      return !isCancelledOrReturned(order.status);
    case "returned":
      return order.status === "returned";
    case "cancelled_only":
      return order.status === "cancelled";
    case "cancelled":
      return isCancelledOrReturned(order.status);
    case "unverified":
      return !order.verified_at;
    case "all":
    default:
      return true;
  }
}

export function computeSalesStatusCounts(orders: MlSaleOrder[]): MlSalesStatusCounts {
  let valid = 0;
  let returned = 0;
  let cancelledOnly = 0;
  let unverified = 0;

  for (const order of orders) {
    if (!order.verified_at) unverified += 1;
    if (order.status === "returned") {
      returned += 1;
    } else if (order.status === "cancelled") {
      cancelledOnly += 1;
    } else {
      valid += 1;
    }
  }

  return {
    all: orders.length,
    valid,
    returned,
    cancelled_only: cancelledOnly,
    cancelled_or_returned: returned + cancelledOnly,
    unverified,
  };
}

export function isMpMoneyReleased(
  order: Pick<MlSaleOrder, "mp_release_status" | "mp_release_date">
): boolean {
  if (order.mp_release_status === "released") return true;
  if (order.mp_release_date) {
    const parsed = Date.parse(order.mp_release_date);
    if (!Number.isNaN(parsed) && parsed <= Date.now()) {
      return true;
    }
  }
  return false;
}

export function getOrderOperationalCostsOnly(order: MlSaleOrder): number {
  return roundCurrency(
    Number(order.cost_material || 0) +
      Number(order.cost_packaging || 0) +
      Number(order.cost_logistics || 0) +
      Number(order.cost_printing || 0) +
      Number(order.cost_accessories_kit || 0)
  );
}

export function toBrazilDateKeyAndLabel(isoDate: string): { dateKey: string; dateLabel: string } {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return { dateKey: "1970-01-01", dateLabel: "01/01/1970" };
  }
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";

  return {
    dateKey: `${year}-${month}-${day}`,
    dateLabel: `${day}/${month}/${year}`,
  };
}

/**
 * Retorna a data de referência do pedido conforme o modo de análise selecionado:
 * - `order_date`: Data/hora da venda (`order.order_date`)
 * - `shipping_date`: Data/hora real de postagem/coleta (`order.shipped_at`, ou `null` se ainda não enviado)
 */
export function getOrderAnalysisDateIso(
  order: Pick<MlSaleOrder, "order_date" | "shipped_at">,
  analysisMode: SalesAnalysisMode = "order_date"
): string | null {
  if (analysisMode === "shipping_date") {
    return order.shipped_at || null;
  }
  return order.order_date;
}

/**
 * Filtra e ordena uma coleção de pedidos pelo intervalo `[fromDate, toDate]` (YYYY-MM-DD no fuso `America/Sao_Paulo`)
 * respeitando estritamente o modo `order_date` (data da venda) ou `shipping_date` (dia real do envio).
 */
export function filterOrdersByAnalysisMode(params: {
  orders: MlSaleOrder[];
  fromDate: string;
  toDate: string;
  analysisMode: SalesAnalysisMode;
}): MlSaleOrder[] {
  const { orders, fromDate, toDate, analysisMode } = params;

  return orders
    .filter((order) => {
      const refIso = getOrderAnalysisDateIso(order, analysisMode);
      if (!refIso) return false;
      const { dateKey } = toBrazilDateKeyAndLabel(refIso);
      return dateKey >= fromDate && dateKey <= toDate;
    })
    .sort((a, b) => {
      const isoA = getOrderAnalysisDateIso(a, analysisMode) || "";
      const isoB = getOrderAnalysisDateIso(b, analysisMode) || "";
      return Date.parse(isoB) - Date.parse(isoA);
    });
}

export function computeSalesDashboardAnalytics(params: {
  filteredOrders: MlSaleOrder[];
  periodOrdersForSellerCards?: MlSaleOrder[];
  sellers: Seller[];
  analysisMode?: SalesAnalysisMode;
}): {
  kpis: MlSalesSummaryKpis;
  sellerSummaries: SellerTransferSummary[];
  dailyClosing: DailyClosingRow[];
} {
  const { filteredOrders, sellers, analysisMode = "order_date" } = params;
  const sellerMap = new Map<string, Seller>(sellers.map((s) => [s.id, s]));

  const effectiveOrders =
    analysisMode === "shipping_date"
      ? filteredOrders.filter((o) => Boolean(o.shipped_at))
      : filteredOrders;

  let validOrdersCount = 0;
  let cancelledOrdersCount = 0;
  let unverifiedOrdersCount = 0;
  let unassignedOrdersCount = 0;

  let grossValidSales = 0;
  let sellerTransferBaseTotal = 0;
  let effectiveSellerTransferTotal = 0;
  let mlCommissionTotal = 0;
  let mlShippingTotal = 0;
  let mlPromoRebateTotal = 0;
  let taxTotal = 0;
  let operationalCostsTotal = 0;
  let netOperationalProfitTotal = 0;

  for (const order of effectiveOrders) {
    if (!order.verified_at) unverifiedOrdersCount += 1;
    if (!order.assigned_seller_id) unassignedOrdersCount += 1;

    if (isCancelledOrReturned(order.status)) {
      cancelledOrdersCount += 1;
      continue;
    }

    validOrdersCount += 1;
    const gross = Number(order.gross_sale_amount || 0);
    const comm = Number(order.ml_commission_amount || 0);
    const ship = Number(order.ml_shipping_cost || 0);
    const rebate = Number(order.ml_promo_rebate || 0);
    const baseTransfer = Number(order.seller_transfer_profit || 0);
    const tax = Number(order.tax_amount || 0);
    const opCosts = getOrderOperationalCostsOnly(order);
    const netClean = Number(order.net_operational_profit || 0);

    const seller = order.assigned_seller_id ? sellerMap.get(order.assigned_seller_id) : undefined;
    const commissionPct = seller ? Number(seller.commission_pct ?? 100) : 100;
    const effectiveTransfer = roundCurrency(baseTransfer * (commissionPct / 100));

    grossValidSales = roundCurrency(grossValidSales + gross);
    mlCommissionTotal = roundCurrency(mlCommissionTotal + comm);
    mlShippingTotal = roundCurrency(mlShippingTotal + ship);
    mlPromoRebateTotal = roundCurrency(mlPromoRebateTotal + rebate);
    sellerTransferBaseTotal = roundCurrency(sellerTransferBaseTotal + baseTransfer);
    effectiveSellerTransferTotal = roundCurrency(effectiveSellerTransferTotal + effectiveTransfer);
    taxTotal = roundCurrency(taxTotal + tax);
    operationalCostsTotal = roundCurrency(operationalCostsTotal + opCosts);
    netOperationalProfitTotal = roundCurrency(netOperationalProfitTotal + netClean);
  }

  const mlNetPlatformDiscount = roundCurrency(
    mlCommissionTotal + mlShippingTotal - mlPromoRebateTotal
  );
  const netMarginPct =
    grossValidSales > 0 ? roundCurrency((netOperationalProfitTotal / grossValidSales) * 100) : 0;

  const kpis: MlSalesSummaryKpis = {
    valid_orders_count: validOrdersCount,
    cancelled_orders_count: cancelledOrdersCount,
    unverified_orders_count: unverifiedOrdersCount,
    unassigned_orders_count: unassignedOrdersCount,
    gross_valid_sales: grossValidSales,
    seller_transfer_base_total: sellerTransferBaseTotal,
    effective_seller_transfer_total: effectiveSellerTransferTotal,
    ml_commission_total: mlCommissionTotal,
    ml_shipping_total: mlShippingTotal,
    ml_promo_rebate_total: mlPromoRebateTotal,
    ml_net_platform_discount: mlNetPlatformDiscount,
    tax_total: taxTotal,
    operational_costs_total: operationalCostsTotal,
    net_operational_profit_total: netOperationalProfitTotal,
    net_margin_pct: netMarginPct,
  };

  // Resumo Individual por Vendedor (baseado nos pedidos filtrados ativos do modo atual)
  const rawSellerSource = params.periodOrdersForSellerCards ?? effectiveOrders;
  const sellerSourceOrders =
    analysisMode === "shipping_date"
      ? rawSellerSource.filter((o) => Boolean(o.shipped_at))
      : rawSellerSource;
  const sellerSummariesMap = new Map<string, SellerTransferSummary>();

  for (const s of sellers) {
    if (!s.active) continue;
    sellerSummariesMap.set(s.id, {
      seller_id: s.id,
      name: s.name,
      color_hex: s.color_hex,
      commission_pct: Number(s.commission_pct ?? 100),
      active: s.active,
      total_orders_in_period: 0,
      valid_orders_count: 0,
      base_transfer_total: 0,
      effective_transfer_total: 0,
      mp_released_amount: 0,
      mp_pending_amount: 0,
    });
  }

  for (const order of sellerSourceOrders) {
    if (!order.assigned_seller_id) continue;
    let summary = sellerSummariesMap.get(order.assigned_seller_id);
    if (!summary) {
      const inactiveSeller = sellerMap.get(order.assigned_seller_id);
      if (!inactiveSeller) continue;
      summary = {
        seller_id: inactiveSeller.id,
        name: inactiveSeller.name,
        color_hex: inactiveSeller.color_hex,
        commission_pct: Number(inactiveSeller.commission_pct ?? 100),
        active: inactiveSeller.active,
        total_orders_in_period: 0,
        valid_orders_count: 0,
        base_transfer_total: 0,
        effective_transfer_total: 0,
        mp_released_amount: 0,
        mp_pending_amount: 0,
      };
      sellerSummariesMap.set(inactiveSeller.id, summary);
    }

    summary.total_orders_in_period += 1;
    if (isCancelledOrReturned(order.status)) continue;

    const base = Number(order.seller_transfer_profit || 0);
    const effective = roundCurrency(base * (summary.commission_pct / 100));

    summary.valid_orders_count += 1;
    summary.base_transfer_total = roundCurrency(summary.base_transfer_total + base);
    summary.effective_transfer_total = roundCurrency(summary.effective_transfer_total + effective);

    if (isMpMoneyReleased(order)) {
      summary.mp_released_amount = roundCurrency(summary.mp_released_amount + effective);
    } else {
      summary.mp_pending_amount = roundCurrency(summary.mp_pending_amount + effective);
    }
  }

  const sellerSummaries = Array.from(sellerSummariesMap.values());

  // Consolidado Dia a Dia (Fechamento agrupado por Data da Venda OU Dia do Envio)
  const dailyMap = new Map<string, DailyClosingRow>();

  for (const order of effectiveOrders) {
    const refIso = getOrderAnalysisDateIso(order, analysisMode);
    if (!refIso) continue;

    const { dateKey, dateLabel } = toBrazilDateKeyAndLabel(refIso);
    let row = dailyMap.get(dateKey);
    if (!row) {
      row = {
        date_key: dateKey,
        date_label: dateLabel,
        valid_orders_count: 0,
        cancelled_orders_count: 0,
        gross_sale_total: 0,
        net_ml_fees_and_shipping: 0,
        base_transfer_total: 0,
        effective_transfer_total: 0,
        seller_transfers: {},
        unassigned_transfer_total: 0,
        operational_costs_and_tax_total: 0,
        net_operational_profit_total: 0,
      };
      dailyMap.set(dateKey, row);
    }

    if (isCancelledOrReturned(order.status)) {
      row.cancelled_orders_count += 1;
      continue;
    }

    row.valid_orders_count += 1;
    const gross = Number(order.gross_sale_amount || 0);
    const netMlFee =
      Number(order.ml_commission_amount || 0) +
      Number(order.ml_shipping_cost || 0) -
      Number(order.ml_promo_rebate || 0);
    const baseTransfer = Number(order.seller_transfer_profit || 0);
    const opAndTax = Number(order.tax_amount || 0) + getOrderOperationalCostsOnly(order);
    const cleanProfit = Number(order.net_operational_profit || 0);

    row.gross_sale_total = roundCurrency(row.gross_sale_total + gross);
    row.net_ml_fees_and_shipping = roundCurrency(row.net_ml_fees_and_shipping + netMlFee);
    row.base_transfer_total = roundCurrency((row.base_transfer_total ?? 0) + baseTransfer);
    row.operational_costs_and_tax_total = roundCurrency(
      row.operational_costs_and_tax_total + opAndTax
    );
    row.net_operational_profit_total = roundCurrency(
      row.net_operational_profit_total + cleanProfit
    );

    if (order.assigned_seller_id) {
      const seller = sellerMap.get(order.assigned_seller_id);
      const pct = seller ? Number(seller.commission_pct ?? 100) : 100;
      const effectiveTransfer = roundCurrency(baseTransfer * (pct / 100));
      row.effective_transfer_total = roundCurrency(
        (row.effective_transfer_total ?? 0) + effectiveTransfer
      );
      row.seller_transfers[order.assigned_seller_id] = roundCurrency(
        (row.seller_transfers[order.assigned_seller_id] ?? 0) + effectiveTransfer
      );
    } else {
      row.effective_transfer_total = roundCurrency(
        (row.effective_transfer_total ?? 0) + baseTransfer
      );
      row.unassigned_transfer_total = roundCurrency(
        row.unassigned_transfer_total + baseTransfer
      );
    }
  }

  const dailyClosing = Array.from(dailyMap.values()).sort((a, b) =>
    b.date_key.localeCompare(a.date_key)
  );

  return { kpis, sellerSummaries, dailyClosing };
}

function normalizeReasonLabel(order: Pick<MlSaleOrder, "status" | "cancellation_reason">): string {
  const raw = (order.cancellation_reason || "").trim();
  if (raw) return raw;
  return order.status === "returned"
    ? "Devolução pós-envio (sem motivo detalhado na API ML)"
    : "Cancelamento registrado no Mercado Livre";
}

export function computeReturnsAndCancellationsAnalytics(params: {
  scopeOrders: MlSaleOrder[];
  sellers: Seller[];
  analysisMode?: SalesAnalysisMode;
}): MlReturnsAnalyticsSummary {
  const { scopeOrders, sellers, analysisMode = "order_date" } = params;
  const sellerMap = new Map<string, Seller>(sellers.map((s) => [s.id, s]));

  const effectiveOrders =
    analysisMode === "shipping_date"
      ? scopeOrders.filter((o) => Boolean(o.shipped_at))
      : scopeOrders;

  let validOrdersCount = 0;
  let returnedOrdersCount = 0;
  let cancelledOrdersCount = 0;
  let grossReturnedAmount = 0;
  let grossCancelledAmount = 0;
  let retainedOperationalCostTotal = 0;

  const affectedOrders: MlSaleOrder[] = [];

  interface ProductAcc {
    mlb_id: string;
    sku: string | null;
    product_title: string;
    product_thumbnail: string | null;
    permalink: string | null;
    total_orders_count: number;
    total_units: number;
    valid_orders_count: number;
    returned_orders_count: number;
    cancelled_orders_count: number;
    affected_units: number;
    gross_valid_amount: number;
    gross_returned_amount: number;
    gross_cancelled_amount: number;
    retained_operational_cost: number;
    reasonCounts: Map<string, number>;
  }

  const productMap = new Map<string, ProductAcc>();
  const reasonMap = new Map<
    string,
    {
      reason: string;
      count: number;
      returned_count: number;
      cancelled_count: number;
      gross_amount: number;
    }
  >();

  const sellerLossMap = new Map<
    string,
    {
      seller_id: string;
      seller_name: string;
      color_hex: string;
      total_orders_count: number;
      returned_count: number;
      cancelled_count: number;
      gross_affected_amount: number;
    }
  >();

  for (const order of effectiveOrders) {
    const mlbKey = (order.mlb_id || "SEM-MLB").toUpperCase();
    const qty = Math.max(1, Number(order.quantity || 1));
    const gross = Number(order.gross_sale_amount || 0);
    const opCost = getOrderOperationalCostsOnly(order);

    let prod = productMap.get(mlbKey);
    if (!prod) {
      prod = {
        mlb_id: mlbKey,
        sku: order.sku || null,
        product_title: order.product_title || mlbKey,
        product_thumbnail: order.product_thumbnail || null,
        permalink: order.permalink || null,
        total_orders_count: 0,
        total_units: 0,
        valid_orders_count: 0,
        returned_orders_count: 0,
        cancelled_orders_count: 0,
        affected_units: 0,
        gross_valid_amount: 0,
        gross_returned_amount: 0,
        gross_cancelled_amount: 0,
        retained_operational_cost: 0,
        reasonCounts: new Map<string, number>(),
      };
      productMap.set(mlbKey, prod);
    } else {
      if (!prod.sku && order.sku) prod.sku = order.sku;
      if (!prod.product_thumbnail && order.product_thumbnail) {
        prod.product_thumbnail = order.product_thumbnail;
      }
      if (!prod.permalink && order.permalink) prod.permalink = order.permalink;
    }

    prod.total_orders_count += 1;
    prod.total_units += qty;

    const sellerKey = order.assigned_seller_id || "__UNASSIGNED__";
    let sellerAcc = sellerLossMap.get(sellerKey);
    if (!sellerAcc) {
      const sellerObj = order.assigned_seller_id
        ? sellerMap.get(order.assigned_seller_id)
        : undefined;
      sellerAcc = {
        seller_id: sellerKey,
        seller_name: sellerObj ? sellerObj.name : "Sem Vendedor",
        color_hex: sellerObj ? sellerObj.color_hex : "#64748B",
        total_orders_count: 0,
        returned_count: 0,
        cancelled_count: 0,
        gross_affected_amount: 0,
      };
      sellerLossMap.set(sellerKey, sellerAcc);
    }
    sellerAcc.total_orders_count += 1;

    if (order.status === "returned") {
      returnedOrdersCount += 1;
      grossReturnedAmount = roundCurrency(grossReturnedAmount + gross);
      retainedOperationalCostTotal = roundCurrency(retainedOperationalCostTotal + opCost);

      prod.returned_orders_count += 1;
      prod.affected_units += qty;
      prod.gross_returned_amount = roundCurrency(prod.gross_returned_amount + gross);
      prod.retained_operational_cost = roundCurrency(prod.retained_operational_cost + opCost);

      sellerAcc.returned_count += 1;
      sellerAcc.gross_affected_amount = roundCurrency(sellerAcc.gross_affected_amount + gross);

      const reason = normalizeReasonLabel(order);
      prod.reasonCounts.set(reason, (prod.reasonCounts.get(reason) ?? 0) + 1);
      const rEntry = reasonMap.get(reason) ?? {
        reason,
        count: 0,
        returned_count: 0,
        cancelled_count: 0,
        gross_amount: 0,
      };
      rEntry.count += 1;
      rEntry.returned_count += 1;
      rEntry.gross_amount = roundCurrency(rEntry.gross_amount + gross);
      reasonMap.set(reason, rEntry);

      affectedOrders.push(order);
    } else if (order.status === "cancelled") {
      cancelledOrdersCount += 1;
      grossCancelledAmount = roundCurrency(grossCancelledAmount + gross);

      prod.cancelled_orders_count += 1;
      prod.affected_units += qty;
      prod.gross_cancelled_amount = roundCurrency(prod.gross_cancelled_amount + gross);

      sellerAcc.cancelled_count += 1;
      sellerAcc.gross_affected_amount = roundCurrency(sellerAcc.gross_affected_amount + gross);

      const reason = normalizeReasonLabel(order);
      prod.reasonCounts.set(reason, (prod.reasonCounts.get(reason) ?? 0) + 1);
      const rEntry = reasonMap.get(reason) ?? {
        reason,
        count: 0,
        returned_count: 0,
        cancelled_count: 0,
        gross_amount: 0,
      };
      rEntry.count += 1;
      rEntry.cancelled_count += 1;
      rEntry.gross_amount = roundCurrency(rEntry.gross_amount + gross);
      reasonMap.set(reason, rEntry);

      affectedOrders.push(order);
    } else {
      validOrdersCount += 1;
      prod.valid_orders_count += 1;
      prod.gross_valid_amount = roundCurrency(prod.gross_valid_amount + gross);
    }
  }

  const totalPeriodOrders = effectiveOrders.length;
  const totalAffectedCount = returnedOrdersCount + cancelledOrdersCount;
  const grossTotalAffectedAmount = roundCurrency(grossReturnedAmount + grossCancelledAmount);

  const pct = (num: number, den: number) =>
    den > 0 ? roundCurrency((num / den) * 100) : 0;

  const productRanking: MlProductReturnRankingRow[] = Array.from(productMap.values())
    .filter((p) => p.returned_orders_count + p.cancelled_orders_count > 0)
    .map((p) => {
      const affectedCount = p.returned_orders_count + p.cancelled_orders_count;
      const grossAffected = roundCurrency(p.gross_returned_amount + p.gross_cancelled_amount);
      const sortedReasons = Array.from(p.reasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

      return {
        mlb_id: p.mlb_id,
        sku: p.sku,
        product_title: p.product_title,
        product_thumbnail: p.product_thumbnail,
        permalink: p.permalink,
        total_orders_count: p.total_orders_count,
        total_units: p.total_units,
        valid_orders_count: p.valid_orders_count,
        returned_orders_count: p.returned_orders_count,
        cancelled_orders_count: p.cancelled_orders_count,
        affected_orders_count: affectedCount,
        affected_units: p.affected_units,
        return_rate_pct: pct(p.returned_orders_count, p.total_orders_count),
        cancel_rate_pct: pct(p.cancelled_orders_count, p.total_orders_count),
        loss_rate_pct: pct(affectedCount, p.total_orders_count),
        gross_valid_amount: p.gross_valid_amount,
        gross_returned_amount: p.gross_returned_amount,
        gross_cancelled_amount: p.gross_cancelled_amount,
        gross_affected_amount: grossAffected,
        retained_operational_cost: p.retained_operational_cost,
        top_reason: sortedReasons[0]?.reason ?? null,
        reasons: sortedReasons,
      };
    })
    .sort((a, b) => {
      if (b.affected_orders_count !== a.affected_orders_count) {
        return b.affected_orders_count - a.affected_orders_count;
      }
      if (b.returned_orders_count !== a.returned_orders_count) {
        return b.returned_orders_count - a.returned_orders_count;
      }
      return b.gross_affected_amount - a.gross_affected_amount;
    });

  const reasonsBreakdown: MlReturnReasonSummaryRow[] = Array.from(reasonMap.values())
    .map((r) => ({
      ...r,
      share_pct: pct(r.count, totalAffectedCount),
    }))
    .sort((a, b) => b.count - a.count || b.gross_amount - a.gross_amount);

  const sellerLosses: MlSellerLossSummaryRow[] = Array.from(sellerLossMap.values())
    .filter((s) => s.returned_count + s.cancelled_count > 0)
    .map((s) => {
      const affected = s.returned_count + s.cancelled_count;
      return {
        seller_id: s.seller_id,
        seller_name: s.seller_name,
        color_hex: s.color_hex,
        total_orders_count: s.total_orders_count,
        returned_count: s.returned_count,
        cancelled_count: s.cancelled_count,
        affected_count: affected,
        loss_rate_pct: pct(affected, s.total_orders_count),
        gross_affected_amount: s.gross_affected_amount,
      };
    })
    .sort((a, b) => b.affected_count - a.affected_count || b.gross_affected_amount - a.gross_affected_amount);

  return {
    total_period_orders: totalPeriodOrders,
    valid_orders_count: validOrdersCount,
    returned_orders_count: returnedOrdersCount,
    cancelled_orders_count: cancelledOrdersCount,
    total_affected_count: totalAffectedCount,
    return_rate_pct: pct(returnedOrdersCount, totalPeriodOrders),
    cancel_rate_pct: pct(cancelledOrdersCount, totalPeriodOrders),
    combined_loss_rate_pct: pct(totalAffectedCount, totalPeriodOrders),
    gross_returned_amount: grossReturnedAmount,
    gross_cancelled_amount: grossCancelledAmount,
    gross_total_affected_amount: grossTotalAffectedAmount,
    retained_operational_cost_total: retainedOperationalCostTotal,
    reasons_breakdown: reasonsBreakdown,
    seller_losses: sellerLosses,
    product_ranking: productRanking,
    affected_orders: affectedOrders,
  };
}
