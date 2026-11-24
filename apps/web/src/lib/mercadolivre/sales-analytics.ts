import type {
  DailyClosingRow,
  MlSaleOrder,
  MlSalesSummaryKpis,
  Seller,
  SellerTransferSummary,
} from "@/types/ml-sales";

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isCancelledOrReturned(status: string): boolean {
  return status === "cancelled" || status === "returned";
}

export function isMpMoneyReleased(order: Pick<MlSaleOrder, "mp_release_status" | "mp_release_date">): boolean {
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

export function computeSalesDashboardAnalytics(params: {
  filteredOrders: MlSaleOrder[];
  periodOrdersForSellerCards?: MlSaleOrder[];
  sellers: Seller[];
}): {
  kpis: MlSalesSummaryKpis;
  sellerSummaries: SellerTransferSummary[];
  dailyClosing: DailyClosingRow[];
} {
  const { filteredOrders, sellers } = params;
  const sellerMap = new Map<string, Seller>(sellers.map((s) => [s.id, s]));

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

  for (const order of filteredOrders) {
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

  // Resumo Individual por Vendedor (baseado nos pedidos filtrados ativos)
  const sellerSourceOrders = params.periodOrdersForSellerCards ?? filteredOrders;
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

  // Consolidado Dia a Dia (Fechamento)
  const dailyMap = new Map<string, DailyClosingRow>();

  for (const order of filteredOrders) {
    const { dateKey, dateLabel } = toBrazilDateKeyAndLabel(order.order_date);
    let row = dailyMap.get(dateKey);
    if (!row) {
      row = {
        date_key: dateKey,
        date_label: dateLabel,
        valid_orders_count: 0,
        cancelled_orders_count: 0,
        gross_sale_total: 0,
        net_ml_fees_and_shipping: 0,
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
      row.seller_transfers[order.assigned_seller_id] = roundCurrency(
        (row.seller_transfers[order.assigned_seller_id] ?? 0) + effectiveTransfer
      );
    } else {
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

