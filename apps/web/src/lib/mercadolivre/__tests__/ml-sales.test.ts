import assert from "node:assert/strict";
import test from "node:test";
import {
  computeReturnsAndCancellationsAnalytics,
  computeSalesDashboardAnalytics,
  computeSalesStatusCounts,
  filterOrdersByAnalysisMode,
  matchesSalesStatusFilter,
} from "../sales-analytics";
import {
  extractShipmentDatesAndLogistics,
  normalizeManualShippedAtInput,
  normalizeSyncIsoRange,
  splitIsoRangeIntoMonthlyWindows,
} from "../shipment-extraction";
import {
  computeDatePresetRange,
  computeSpecificMonthRange,
  computeSpecificYearRange,
  toBrazilInputDate,
  upgradeMlThumbnailUrl,
} from "../../../components/vendas/formatters";
import type { MlSaleOrder, Seller } from "../../../types/ml-sales";

function makeSeller(overrides: Partial<Seller>): Seller {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: null,
    user_id: null,
    name: "Carlos Operação",
    color_hex: "#059669",
    commission_pct: 100,
    active: true,
    created_at: "2026-11-24T10:00:00.000Z",
    updated_at: "2026-11-24T10:00:00.000Z",
    ...overrides,
  };
}

function makeOrder(overrides: Partial<MlSaleOrder>): MlSaleOrder {
  const gross = overrides.gross_sale_amount ?? 200;
  const comm = overrides.ml_commission_amount ?? 32;
  const ship = overrides.ml_shipping_cost ?? 20;
  const rebate = overrides.ml_promo_rebate ?? 5;
  const status = overrides.status ?? "paid";
  const cancelled = status === "cancelled" || status === "returned";

  const taxPct = overrides.tax_pct ?? 4;
  const taxAmount = cancelled ? 0 : Number((gross * (taxPct / 100)).toFixed(2));
  const transferProfit = cancelled ? 0 : Number((gross - comm - ship + rebate).toFixed(2));
  const opCosts =
    (overrides.cost_material ?? 40) +
    (overrides.cost_packaging ?? 3) +
    (overrides.cost_logistics ?? 2) +
    (overrides.cost_printing ?? 0.5) +
    (overrides.cost_accessories_kit ?? 4.5);
  const netClean = cancelled
    ? 0
    : Number((transferProfit - taxAmount - opCosts).toFixed(2));

  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: null,
    user_id: null,
    ml_order_id: 2000009001,
    ml_pack_id: null,
    ml_shipment_id: 430001,
    ml_seller_id: "123456",
    store_name: "Loja Matriz ML",
    order_date: "2026-11-24T13:30:00.000Z",
    shipping_deadline: "2026-11-25T15:00:00.000Z",
    shipped_at: null,
    delivered_at: null,
    logistic_type: "cross_docking",
    status,
    cancellation_reason: cancelled ? "Cancelado pelo comprador" : null,
    mlb_id: "MLB391827364",
    sku: "SKU-001",
    product_title: "Kit Película Automotiva PPF",
    product_thumbnail: null,
    permalink: null,
    quantity: 1,
    buyer_name: "João Comprador",
    buyer_document: "12345678901",
    is_business_buyer: false,
    assigned_seller_id: "11111111-1111-4111-8111-111111111111",
    verified_at: null,
    costs_manually_edited: false,
    gross_sale_amount: gross,
    ml_commission_pct: 16,
    ml_commission_amount: comm,
    ml_shipping_cost: ship,
    ml_promo_rebate: rebate,
    mp_net_released: transferProfit,
    mp_release_date: "2026-11-20T12:00:00.000Z",
    mp_release_status: "released",
    tax_pct: taxPct,
    tax_amount: taxAmount,
    cost_material: 40,
    cost_packaging: 3,
    cost_logistics: 2,
    cost_printing: 0.5,
    cost_accessories_kit: 4.5,
    seller_transfer_profit: transferProfit,
    net_operational_profit: netClean,
    created_at: "2026-11-24T13:30:00.000Z",
    updated_at: "2026-11-24T13:30:00.000Z",
    ...overrides,
  };
}

test("apuração financeira soma estorno promocional ML e zera vendas canceladas/devolvidas", () => {
  // Arrange
  const sellerIntegral = makeSeller({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Carlos (100%)",
    commission_pct: 100,
  });
  const sellerSocio = makeSeller({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Ana Sócia (50%)",
    commission_pct: 50,
  });

  const validOrder1 = makeOrder({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    ml_order_id: 2000009001,
    assigned_seller_id: sellerIntegral.id,
    mp_release_status: "released",
  });

  const validOrder2 = makeOrder({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    ml_order_id: 2000009002,
    assigned_seller_id: sellerSocio.id,
    mp_release_status: "pending",
    mp_release_date: "2099-01-01T00:00:00.000Z",
  });

  const cancelledOrder = makeOrder({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    ml_order_id: 2000009003,
    status: "cancelled",
    assigned_seller_id: sellerIntegral.id,
  });

  // Act
  const result = computeSalesDashboardAnalytics({
    filteredOrders: [validOrder1, validOrder2, cancelledOrder],
    sellers: [sellerIntegral, sellerSocio],
  });

  // Assert
  assert.equal(result.kpis.valid_orders_count, 2);
  assert.equal(result.kpis.cancelled_orders_count, 1);
  assert.equal(result.kpis.gross_valid_sales, 400);
  assert.equal(result.kpis.ml_commission_total, 64);
  assert.equal(result.kpis.ml_shipping_total, 40);
  assert.equal(result.kpis.ml_promo_rebate_total, 10);
  assert.equal(result.kpis.seller_transfer_base_total, 306);
  assert.equal(result.kpis.effective_seller_transfer_total, 229.5);
  assert.equal(result.kpis.net_operational_profit_total, 190);

  assert.equal(result.dailyClosing.length, 1);
  assert.equal(result.dailyClosing[0].valid_orders_count, 2);
  assert.equal(result.dailyClosing[0].cancelled_orders_count, 1);
  assert.equal(result.dailyClosing[0].seller_transfers[sellerIntegral.id], 153);
  assert.equal(result.dailyClosing[0].seller_transfers[sellerSocio.id], 76.5);
});

test("análise Por Dia do Envio (shipping_date) agrupa vendas compradas na sexta e enviadas na segunda pelo dia real do envio e exclui não enviadas", () => {
  // Arrange
  const seller = makeSeller({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Carlos",
    commission_pct: 100,
  });

  // Pedido A: comprado na sexta 20/11 às 21:00 BRT, enviado na segunda 23/11 às 14:15 BRT
  const fridayBoughtMondayShipped = makeOrder({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    ml_order_id: 2000010001,
    status: "shipped",
    order_date: "2026-11-21T00:00:00.000Z", // 20/11 21:00 BRT
    shipped_at: "2026-11-23T17:15:00.000Z", // 23/11 14:15 BRT
    assigned_seller_id: seller.id,
  });

  // Pedido B: comprado na segunda 23/11 às 09:00 BRT e enviado no mesmo dia 23/11 às 16:00 BRT
  const mondayBoughtMondayShipped = makeOrder({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    ml_order_id: 2000010002,
    status: "delivered",
    order_date: "2026-11-23T12:00:00.000Z",
    shipped_at: "2026-11-23T19:00:00.000Z",
    assigned_seller_id: seller.id,
  });

  // Pedido C: comprado na segunda 23/11 às 22:30 BRT, ainda pago aguardando envio (shipped_at = null)
  const mondayBoughtStillUnshipped = makeOrder({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
    ml_order_id: 2000010003,
    status: "paid",
    order_date: "2026-11-24T01:30:00.000Z", // 23/11 22:30 BRT
    shipped_at: null,
    assigned_seller_id: seller.id,
  });

  const allOrders = [
    fridayBoughtMondayShipped,
    mondayBoughtMondayShipped,
    mondayBoughtStillUnshipped,
  ];

  // Act 1: Filtrando dia 23/11 por Data da Venda -> traz B e C (comprados em 23/11), ignora A (comprado em 20/11)
  const byOrderDate23 = filterOrdersByAnalysisMode({
    orders: allOrders,
    fromDate: "2026-11-23",
    toDate: "2026-11-23",
    analysisMode: "order_date",
  });
  const analyticsByOrderDate = computeSalesDashboardAnalytics({
    filteredOrders: byOrderDate23,
    sellers: [seller],
    analysisMode: "order_date",
  });

  // Act 2: Filtrando dia 23/11 por Dia do Envio -> traz A e B (enviados em 23/11), ignora C (ainda não enviado)
  const byShippingDate23 = filterOrdersByAnalysisMode({
    orders: allOrders,
    fromDate: "2026-11-23",
    toDate: "2026-11-23",
    analysisMode: "shipping_date",
  });
  const analyticsByShippingDate = computeSalesDashboardAnalytics({
    filteredOrders: byShippingDate23,
    sellers: [seller],
    analysisMode: "shipping_date",
  });

  // Assert
  assert.deepEqual(
    byOrderDate23.map((o) => o.ml_order_id),
    [2000010003, 2000010002]
  );
  assert.equal(analyticsByOrderDate.kpis.valid_orders_count, 2);

  assert.deepEqual(
    byShippingDate23.map((o) => o.ml_order_id),
    [2000010002, 2000010001]
  );
  assert.equal(analyticsByShippingDate.kpis.valid_orders_count, 2);
  assert.equal(analyticsByShippingDate.kpis.gross_valid_sales, 400);
  assert.equal(analyticsByShippingDate.dailyClosing.length, 1);
  assert.equal(analyticsByShippingDate.dailyClosing[0].date_key, "2026-11-23");
  assert.equal(analyticsByShippingDate.dailyClosing[0].date_label, "23/11/2026");
  assert.equal(analyticsByShippingDate.dailyClosing[0].valid_orders_count, 2);
});

test("extractShipmentDatesAndLogistics resolve cascata ML (x-format-new + classic status_history + timeline) e mantém null para etiquetas não postadas", () => {
  // 1. Etiqueta impressa (ready_to_ship) mas ainda não bipada na transportadora -> shippedAt DEVE ser null
  const unshippedLabel = extractShipmentDatesAndLogistics({
    modernDetail: {
      id: 9001,
      status: "ready_to_ship",
      substatus: "printed",
      logistic: { type: "xd_drop_off" },
    },
    classicDetail: {
      id: 9001,
      status: "ready_to_ship",
      status_history: {
        date_ready_to_ship: "2026-11-24T11:00:00.000-03:00",
        date_shipped: null,
      },
    },
  });
  assert.equal(unshippedLabel.shippedAt, null);
  assert.equal(unshippedLabel.logisticType, "xd_drop_off");

  // 2. x-format-new omitiu status_history, mas schema padrão /shipments/{id} trouxe status_history.date_shipped
  const fromClassicFallback = extractShipmentDatesAndLogistics({
    modernDetail: {
      id: 9002,
      status: "shipped",
      logistic: { type: "cross_docking" },
    },
    classicDetail: {
      id: 9002,
      status: "shipped",
      status_history: {
        date_shipped: "2026-11-24T15:42:10.000-03:00",
        date_delivered: null,
      },
    },
  });
  assert.equal(fromClassicFallback.shippedAt, "2026-11-24T15:42:10.000-03:00");
  assert.equal(fromClassicFallback.logisticType, "cross_docking");

  // 3. Fallback via /shipments/{id}/tracking/timeline quando status_history vier vazio
  const fromTimelineFallback = extractShipmentDatesAndLogistics({
    modernDetail: {
      id: 9003,
      status: "delivered",
      logistic: { type: "fulfillment" },
    },
    timelineEvents: [
      { event_name: "handling", event_date: "2026-11-22T10:00:00.000Z" },
      { event_name: "shipped", event_date: "2026-11-22T14:30:00.000Z" },
      { event_name: "delivered", event_date: "2026-11-23T16:10:00.000Z" },
    ],
  });
  assert.equal(fromTimelineFallback.shippedAt, "2026-11-22T14:30:00.000Z");
  assert.equal(fromTimelineFallback.deliveredAt, "2026-11-23T16:10:00.000Z");
  assert.equal(fromTimelineFallback.logisticType, "fulfillment");

  // 4. Agência ML (xd_drop_off): postado em 23/11 (`dropped_off`), mas ML só mudou status para `shipped` em 25/11 05:18
  // DEVE priorizar a data real de postagem na agência (23/11), não a saída do hub (25/11)
  const agencyDropOffBeforeHubShipped = extractShipmentDatesAndLogistics({
    modernDetail: {
      id: 48576732601,
      status: "shipped",
      logistic: { type: "xd_drop_off" },
    },
    classicDetail: {
      id: 48576732601,
      status: "shipped",
      logistic_type: "xd_drop_off",
      status_history: {
        date_ready_to_ship: "2026-11-22T19:35:20.000-04:00",
        date_shipped: "2026-11-25T04:18:56.781-04:00",
      },
      substatus_history: [
        { status: "pending", substatus: "shipment_paid", date: "2026-11-19T13:15:46.805-04:00" },
        { status: "ready_to_ship", substatus: "ready_to_print", date: "2026-11-22T20:17:04.516-04:00" },
        { status: "ready_to_ship", substatus: "dropped_off", date: "2026-11-23T08:19:17.315-04:00" },
        { status: "ready_to_ship", substatus: "picked_up", date: "2026-11-23T13:10:25.000-04:00" },
        { status: "ready_to_ship", substatus: "in_hub", date: "2026-11-23T14:44:21.095-04:00" },
        { status: "ready_to_ship", substatus: "in_packing_list", date: "2026-11-24T10:11:51.000-04:00" },
      ],
    },
  });
  assert.equal(agencyDropOffBeforeHubShipped.shippedAt, "2026-11-23T08:19:17.315-04:00");
  assert.equal(toBrazilInputDate(agencyDropOffBeforeHubShipped.shippedAt), "2026-11-23");

  // 5. Agência ML já bipada (`ready_to_ship` / `picked_up`) com `status_history.date_shipped = null`
  // DEVE retornar o timestamp exato do `dropped_off` imediatamente
  const agencyDroppedOffStillReadyToShip = extractShipmentDatesAndLogistics({
    modernDetail: {
      id: 48626288130,
      status: "ready_to_ship",
      substatus: "picked_up",
      logistic: { type: "xd_drop_off" },
    },
    classicDetail: {
      id: 48626288130,
      status: "ready_to_ship",
      substatus: "picked_up",
      status_history: {
        date_ready_to_ship: "2026-11-25T07:13:15.000-04:00",
        date_shipped: null,
      },
      substatus_history: [
        { status: "ready_to_ship", substatus: "invoice_pending", date: "2026-11-25T07:13:15.000-04:00" },
        { status: "ready_to_ship", substatus: "ready_to_print", date: "2026-11-25T07:26:29.155-04:00" },
        { status: "ready_to_ship", substatus: "dropped_off", date: "2026-11-25T12:33:16.180-04:00" },
        { status: "ready_to_ship", substatus: "picked_up", date: "2026-11-25T14:12:08.000-04:00" },
      ],
    },
  });
  assert.equal(agencyDroppedOffStillReadyToShip.shippedAt, "2026-11-25T12:33:16.180-04:00");
  assert.equal(toBrazilInputDate(agencyDroppedOffStillReadyToShip.shippedAt), "2026-11-25");

  // 6. Apenas etiqueta pronta/impressa em substatus_history (ainda não entregue na agência) -> DEVE continuar null
  const onlyPrintedInSubstatusHistory = extractShipmentDatesAndLogistics({
    modernDetail: {
      id: 48999999999,
      status: "ready_to_ship",
      substatus: "printed",
      logistic: { type: "xd_drop_off" },
    },
    classicDetail: {
      id: 48999999999,
      status: "ready_to_ship",
      substatus: "printed",
      status_history: {
        date_ready_to_ship: "2026-11-25T07:13:15.000-04:00",
        date_shipped: null,
      },
      substatus_history: [
        { status: "ready_to_ship", substatus: "invoice_pending", date: "2026-11-25T07:13:15.000-04:00" },
        { status: "ready_to_ship", substatus: "waiting_for_carrier_authorization", date: "2026-11-25T07:26:28.156-04:00" },
        { status: "ready_to_ship", substatus: "ready_to_print", date: "2026-11-25T07:26:29.155-04:00" },
        { status: "ready_to_ship", substatus: "printed", date: "2026-11-25T08:00:00.000-04:00" },
      ],
    },
  });
  assert.equal(onlyPrintedInSubstatusHistory.shippedAt, null);
});

test("normalizeSyncIsoRange recua 14 dias automaticamente no modo shipping_date", () => {
  const orderRange = normalizeSyncIsoRange("2026-11-24", "2026-11-24", "order_date");
  assert.equal(orderRange.isoStart, "2026-11-24T00:00:00.000-03:00");

  const shippingRange = normalizeSyncIsoRange("2026-11-24", "2026-11-24", "shipping_date");
  // 2026-11-24T03:00:00Z menos 14 dias = 2026-11-10T03:00:00.000Z (meia-noite BRT de 10/11)
  assert.equal(shippingRange.isoStart, "2026-11-10T03:00:00.000Z");
  assert.equal(shippingRange.isoEnd, "2026-11-24T23:59:59.999-03:00");
});

test("splitIsoRangeIntoMonthlyWindows fatia ano completo em janelas mensais ordenadas da mais recente para a mais antiga", () => {
  const windows = splitIsoRangeIntoMonthlyWindows(
    "2026-01-01T00:00:00.000-03:00",
    "2026-11-25T23:59:59.999-03:00"
  );

  assert.ok(windows.length >= 10 && windows.length <= 13);
  // Primeira janela termina exatamente no fim solicitado
  assert.equal(
    Date.parse(windows[0].isoEnd),
    Date.parse("2026-11-25T23:59:59.999-03:00")
  );
  // Última janela alcança o início do ano solicitado
  assert.equal(
    Date.parse(windows[windows.length - 1].isoStart),
    Date.parse("2026-01-01T00:00:00.000-03:00")
  );
});

test("normalizeManualShippedAtInput fixa meio-dia de Brasília (-03:00) para evitar deslocamento de dia na apuração por data de envio", () => {
  const iso = normalizeManualShippedAtInput("2026-11-25");
  assert.equal(iso, "2026-11-25T15:00:00.000Z");
  assert.equal(toBrazilInputDate(iso), "2026-11-25");
  assert.equal(normalizeManualShippedAtInput(""), null);
  assert.equal(normalizeManualShippedAtInput("invalido"), null);
});

test("data de envio definida manualmente entra na métrica e informa valor obtido exato no dia específico de envio", () => {
  const seller = makeSeller({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Rodolfo",
    commission_pct: 100,
  });

  const manualShippedOrder = makeOrder({
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    ml_order_id: 2000099901,
    status: "paid",
    order_date: "2026-11-20T14:00:00.000Z",
    shipped_at: normalizeManualShippedAtInput("2026-11-25"),
    shipped_at_manual: true,
    gross_sale_amount: 350,
    ml_commission_amount: 49,
    ml_shipping_cost: 21,
    ml_promo_rebate: 10,
    assigned_seller_id: seller.id,
  });

  const filtered = filterOrdersByAnalysisMode({
    orders: [manualShippedOrder],
    fromDate: "2026-11-25",
    toDate: "2026-11-25",
    analysisMode: "shipping_date",
  });

  const analytics = computeSalesDashboardAnalytics({
    filteredOrders: filtered,
    sellers: [seller],
    analysisMode: "shipping_date",
  });

  assert.equal(filtered.length, 1);
  assert.equal(analytics.dailyClosing.length, 1);
  assert.equal(analytics.dailyClosing[0].date_key, "2026-11-25");
  assert.equal(analytics.dailyClosing[0].gross_sale_total, 350);
  // 350 - 49 - 21 + 10 = 290 obtidos pós-ML naquela data específica de envio
  assert.equal(analytics.dailyClosing[0].base_transfer_total, 290);
  assert.equal(analytics.dailyClosing[0].effective_transfer_total, 290);
});

test("filtros pré-definidos por Mês, Ano e Todas as Vendas e upgrade de miniatura HD funcionam corretamente", () => {
  const allRange = computeDatePresetRange("all");
  assert.equal(allRange.isAll, true);
  assert.equal(allRange.from, "");

  const febRange = computeSpecificMonthRange(2026, 2);
  assert.deepEqual(febRange, { from: "2026-02-01", to: "2026-02-28" });

  const pastYearRange = computeSpecificYearRange(2025);
  assert.deepEqual(pastYearRange, { from: "2025-01-01", to: "2025-12-31" });

  assert.equal(
    upgradeMlThumbnailUrl("http://http2.mlstatic.com/D_12345-MLB999_102026-I.jpg"),
    "https://http2.mlstatic.com/D_12345-MLB999_102026-O.jpg"
  );
});

test("filtros separados de devoluções/cancelamentos e ranking por MLB calculam % exata sobre vendas do item", () => {
  // Arrange
  const sellerA = makeSeller({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sociedade Películas",
  });

  // MLB-A: 4 pedidos totais -> 2 válidos, 1 devolvido (pós-envio), 1 cancelado -> 50% perda total (25% dev, 25% canc)
  const mlbAValid1 = makeOrder({
    id: "d1",
    ml_order_id: 3001,
    mlb_id: "MLB5021742533",
    sku: "SKU-PPF-01",
    status: "delivered",
    gross_sale_amount: 100,
    shipped_at: "2026-11-24T15:00:00.000Z",
    assigned_seller_id: sellerA.id,
  });
  const mlbAValid2 = makeOrder({
    id: "d2",
    ml_order_id: 3002,
    mlb_id: "MLB5021742533",
    sku: "SKU-PPF-01",
    status: "shipped",
    gross_sale_amount: 100,
    shipped_at: "2026-11-25T15:00:00.000Z",
    assigned_seller_id: sellerA.id,
  });
  const mlbAReturned = makeOrder({
    id: "d3",
    ml_order_id: 3003,
    mlb_id: "MLB5021742533",
    sku: "SKU-PPF-01",
    status: "returned",
    cancellation_reason: "Arrependimento da compra após entrega",
    gross_sale_amount: 120,
    cost_material: 25,
    cost_packaging: 5,
    cost_logistics: 0,
    cost_printing: 0,
    cost_accessories_kit: 0,
    shipped_at: "2026-11-25T16:00:00.000Z",
    assigned_seller_id: sellerA.id,
  });
  const mlbACancelled = makeOrder({
    id: "d4",
    ml_order_id: 3004,
    mlb_id: "MLB5021742533",
    sku: "SKU-PPF-01",
    status: "cancelled",
    cancellation_reason: "Cancelado pelo comprador antes do envio",
    gross_sale_amount: 80,
    shipped_at: null,
    assigned_seller_id: sellerA.id,
  });

  // MLB-B: 1 pedido válido sem ocorrências (não deve poluir ranking de perdas)
  const mlbBValid = makeOrder({
    id: "d5",
    ml_order_id: 3005,
    mlb_id: "MLB9999999999",
    sku: "SKU-OK-02",
    status: "paid",
    gross_sale_amount: 63,
    assigned_seller_id: sellerA.id,
  });

  const orders = [mlbAValid1, mlbAValid2, mlbAReturned, mlbACancelled, mlbBValid];

  // Act
  const counts = computeSalesStatusCounts(orders);
  const returnedOnly = orders.filter((o) => matchesSalesStatusFilter(o, "returned"));
  const cancelledOnly = orders.filter((o) => matchesSalesStatusFilter(o, "cancelled_only"));
  const bothLosses = orders.filter((o) => matchesSalesStatusFilter(o, "cancelled"));

  const reportOrderDate = computeReturnsAndCancellationsAnalytics({
    scopeOrders: orders,
    sellers: [sellerA],
    analysisMode: "order_date",
  });

  const reportShippingDate = computeReturnsAndCancellationsAnalytics({
    scopeOrders: orders,
    sellers: [sellerA],
    analysisMode: "shipping_date",
  });

  // Assert
  assert.deepEqual(counts, {
    all: 5,
    valid: 3,
    returned: 1,
    cancelled_only: 1,
    cancelled_or_returned: 2,
    unverified: 5,
  });
  assert.equal(returnedOnly.length, 1);
  assert.equal(returnedOnly[0].ml_order_id, 3003);
  assert.equal(cancelledOnly.length, 1);
  assert.equal(cancelledOnly[0].ml_order_id, 3004);
  assert.equal(bothLosses.length, 2);

  assert.equal(reportOrderDate.total_period_orders, 5);
  assert.equal(reportOrderDate.returned_orders_count, 1);
  assert.equal(reportOrderDate.cancelled_orders_count, 1);
  assert.equal(reportOrderDate.total_affected_count, 2);
  assert.equal(reportOrderDate.return_rate_pct, 20);
  assert.equal(reportOrderDate.cancel_rate_pct, 20);
  assert.equal(reportOrderDate.combined_loss_rate_pct, 40);
  assert.equal(reportOrderDate.gross_returned_amount, 120);
  assert.equal(reportOrderDate.gross_cancelled_amount, 80);
  assert.equal(reportOrderDate.gross_total_affected_amount, 200);
  assert.equal(reportOrderDate.retained_operational_cost_total, 30);

  assert.equal(reportOrderDate.product_ranking.length, 1);
  const top = reportOrderDate.product_ranking[0];
  assert.equal(top.mlb_id, "MLB5021742533");
  assert.equal(top.total_orders_count, 4);
  assert.equal(top.returned_orders_count, 1);
  assert.equal(top.cancelled_orders_count, 1);
  assert.equal(top.return_rate_pct, 25);
  assert.equal(top.cancel_rate_pct, 25);
  assert.equal(top.loss_rate_pct, 50);

  // No modo shipping_date: 3 pedidos enviados (2 válidos + 1 devolvido), exclui o cancelado não enviado
  assert.equal(reportShippingDate.total_period_orders, 3);
  assert.equal(reportShippingDate.returned_orders_count, 1);
  assert.equal(reportShippingDate.cancelled_orders_count, 0);
  assert.equal(reportShippingDate.return_rate_pct, 33.33);
});
