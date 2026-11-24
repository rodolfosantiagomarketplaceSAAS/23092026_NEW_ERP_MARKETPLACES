import assert from "node:assert/strict";
import test from "node:test";
import { computeSalesDashboardAnalytics } from "../sales-analytics";
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

  // Pedido 1 (Carlos 100%): Bruto 200 - Comissão 32 - Frete 20 + Estorno 5 = 153.00 repasse
  // Imposto 4% (8.00) + Custos (50.00) => Lucro Limpo = 153 - 8 - 50 = 95.00
  const validOrder1 = makeOrder({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    ml_order_id: 2000009001,
    assigned_seller_id: sellerIntegral.id,
    mp_release_status: "released",
  });

  // Pedido 2 (Ana 50%): Base 153.00, Cota efetiva 50% = 76.50, A liberar no MP
  const validOrder2 = makeOrder({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    ml_order_id: 2000009002,
    assigned_seller_id: sellerSocio.id,
    mp_release_status: "pending",
    mp_release_date: "2099-01-01T00:00:00.000Z",
  });

  // Pedido 3 (Cancelado): não pode somar em faturamento, repasse ou lucro limpo
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

  const carlosSummary = result.sellerSummaries.find(
    (s) => s.seller_id === sellerIntegral.id
  );
  const anaSummary = result.sellerSummaries.find(
    (s) => s.seller_id === sellerSocio.id
  );

  assert.ok(carlosSummary);
  assert.equal(carlosSummary.valid_orders_count, 1);
  assert.equal(carlosSummary.effective_transfer_total, 153);
  assert.equal(carlosSummary.mp_released_amount, 153);
  assert.equal(carlosSummary.mp_pending_amount, 0);

  assert.ok(anaSummary);
  assert.equal(anaSummary.valid_orders_count, 1);
  assert.equal(anaSummary.base_transfer_total, 153);
  assert.equal(anaSummary.effective_transfer_total, 76.5);
  assert.equal(anaSummary.mp_released_amount, 0);
  assert.equal(anaSummary.mp_pending_amount, 76.5);

  assert.equal(result.dailyClosing.length, 1);
  assert.equal(result.dailyClosing[0].valid_orders_count, 2);
  assert.equal(result.dailyClosing[0].cancelled_orders_count, 1);
  assert.equal(result.dailyClosing[0].seller_transfers[sellerIntegral.id], 153);
  assert.equal(result.dailyClosing[0].seller_transfers[sellerSocio.id], 76.5);
});

