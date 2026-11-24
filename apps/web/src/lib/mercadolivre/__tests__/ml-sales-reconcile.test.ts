import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPackShippingProration,
  reconcileOrderFinancials,
  type ExtractedOrderDraft,
} from "../financial-reconciliation";

test("venda real #2000016233183319 (Israel R$ 63,00): abate frete pago pelo comprador (+R$ 5,99) e neutraliza juros do comprador (R$ 7,87), resultando em R$ 47,29 de repasse e 12% comissão", () => {
  // Arrange — payload exato retornado pelo Mercado Pago / Mercado Livre na venda #2000019747930870
  const result = reconcileOrderFinancials({
    grossSaleAmount: 63,
    orderItemsSaleFeeTotal: 7.56,
    shipmentSellerCost: 8.15,
    shipmentBuyerCreditToSeller: 5.99,
    payments: [
      {
        id: 191375878550,
        status: "approved",
        transaction_amount: 63,
        transaction_details: {
          net_received_amount: 41.3,
          total_paid_amount: 70.87,
        },
        fee_details: [
          {
            amount: 7.87,
            fee_payer: "collector",
            type: "financing_fee",
          },
        ],
        charges_details: [
          {
            name: "financing_transfer",
            type: "fee",
            accounts: { from: "payer", to: "collector" },
            amounts: { original: 7.87, refunded: 0 },
          },
          {
            name: "financing_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 7.87, refunded: 0 },
          },
          {
            name: "mp_processing_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 1.73, refunded: 0 },
          },
          {
            name: "ml_sale_fee",
            type: "fee",
            accounts: { from: "collector", to: "ml" },
            amounts: { original: 5.83, refunded: 0 },
          },
          {
            name: "shp_cross_docking",
            type: "shipping",
            accounts: { from: "collector", to: "1745333938" },
            amounts: { original: 14.14, refunded: 0 },
          },
        ],
      },
    ],
  });

  // Assert
  assert.equal(result.mlCommissionAmount, 7.56);
  assert.equal(result.mlCommissionPct, 12);
  assert.equal(result.mlShippingCost, 8.15);
  assert.equal(result.mlPromoRebate, 0);
  assert.equal(result.mpNetReleased, 47.29);
});

test("juros de parcelamento do comprador maiores que a comissão (Augusto R$ 140,83) não inflam comissão nem geram falso estorno", () => {
  // Arrange
  const result = reconcileOrderFinancials({
    grossSaleAmount: 140.83,
    orderItemsSaleFeeTotal: 16.9,
    shipmentSellerCost: 18.15,
    shipmentBuyerCreditToSeller: 0,
    payments: [
      {
        id: 189976732073,
        status: "approved",
        transaction_amount: 140.83,
        transaction_details: {
          net_received_amount: 105.78,
          total_paid_amount: 158.59,
        },
        fee_details: [
          { amount: 17.76, fee_payer: "collector", type: "financing_fee" },
        ],
        charges_details: [
          {
            name: "financing_transfer",
            type: "fee",
            accounts: { from: "payer", to: "collector" },
            amounts: { original: 17.76, refunded: 0 },
          },
          {
            name: "financing_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 17.76, refunded: 0 },
          },
          {
            name: "mp_processing_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 3.87, refunded: 0 },
          },
          {
            name: "ml_sale_fee",
            type: "fee",
            accounts: { from: "collector", to: "ml" },
            amounts: { original: 13.03, refunded: 0 },
          },
          {
            name: "shp_cross_docking",
            type: "shipping",
            accounts: { from: "collector", to: "1745333938" },
            amounts: { original: 18.15, refunded: 0 },
          },
        ],
      },
    ],
  });

  // Assert
  assert.equal(result.mlCommissionAmount, 16.9);
  assert.equal(result.mlCommissionPct, 12);
  assert.equal(result.mlShippingCost, 18.15);
  assert.equal(result.mlPromoRebate, 0);
  assert.equal(result.mpNetReleased, 105.78);
});

test("carrinho multi-item (Pack #2000015487297721): rateia frete único de R$ 16,40 sem criar falso estorno no 2º item", () => {
  // Arrange
  const fin1 = reconcileOrderFinancials({
    grossSaleAmount: 55.95,
    orderItemsSaleFeeTotal: 6.71,
    shipmentSellerCost: 16.4,
    payments: [
      {
        id: 1,
        status: "approved",
        transaction_amount: 55.95,
        transaction_details: { net_received_amount: 32.84, total_paid_amount: 55.95 },
        charges_details: [
          {
            name: "mp_financing_1x_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 0.07, refunded: 0 },
          },
          {
            name: "mp_processing_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 1.54, refunded: 0 },
          },
          {
            name: "ml_sale_fee",
            type: "fee",
            accounts: { from: "collector", to: "ml" },
            amounts: { original: 5.1, refunded: 0 },
          },
          {
            name: "shp_cross_docking",
            type: "shipping",
            accounts: { from: "collector", to: "1745333938" },
            amounts: { original: 16.4, refunded: 0 },
          },
        ],
      },
    ],
  });

  const fin2 = reconcileOrderFinancials({
    grossSaleAmount: 54.05,
    orderItemsSaleFeeTotal: 6.49,
    shipmentSellerCost: 16.4,
    payments: [
      {
        id: 2,
        status: "approved",
        transaction_amount: 54.05,
        transaction_details: { net_received_amount: 47.56, total_paid_amount: 54.05 },
        charges_details: [
          {
            name: "mp_financing_1x_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 0.06, refunded: 0 },
          },
          {
            name: "mp_processing_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 1.49, refunded: 0 },
          },
          {
            name: "ml_sale_fee",
            type: "fee",
            accounts: { from: "collector", to: "ml" },
            amounts: { original: 4.94, refunded: 0 },
          },
        ],
      },
    ],
  });

  const makeDraft = (
    id: number,
    gross: number,
    fin: ReturnType<typeof reconcileOrderFinancials>
  ): ExtractedOrderDraft => ({
    ml_order_id: id,
    ml_pack_id: 2000015487297721,
    ml_shipment_id: 48239051008,
    ml_seller_id: "3398590895",
    store_name: "SANTFELICE",
    order_date: "2026-11-24T12:00:00Z",
    shipping_deadline: null,
    status: "paid",
    cancellation_reason: null,
    mlb_id: "MLB1",
    sku: null,
    product_title: "Item Pack",
    product_thumbnail: null,
    permalink: null,
    quantity: 1,
    buyer_name: "Comprador",
    buyer_document: null,
    is_business_buyer: false,
    gross_sale_amount: gross,
    ml_commission_pct: fin.mlCommissionPct,
    ml_commission_amount: fin.mlCommissionAmount,
    ml_shipping_cost: fin.mlShippingCost,
    ml_promo_rebate: fin.mlPromoRebate,
    mp_net_released: fin.mpNetReleased,
    mp_release_date: null,
    mp_release_status: "pending",
    shipment_fallback_seller_cost: 16.4,
    has_consolidated_pack_payment: false,
  });

  const drafts = [makeDraft(1, 55.95, fin1), makeDraft(2, 54.05, fin2)];

  // Act
  applyPackShippingProration(drafts);

  // Assert — soma exata: 40,90 + 39,50 = R$ 80,40 (32,84 + 47,56)
  assert.equal(drafts[0].ml_promo_rebate, 0);
  assert.equal(drafts[1].ml_promo_rebate, 0);
  assert.equal(drafts[0].ml_shipping_cost, 8.34);
  assert.equal(drafts[1].ml_shipping_cost, 8.06);
  assert.equal(drafts[0].mp_net_released, 40.9);
  assert.equal(drafts[1].mp_net_released, 39.5);
});

test("venda sem pack com frete do comprador embutido no mesmo pagamento (Ítalo R$ 74,95 + R$ 34,99 frete): não duplica crédito e mantém repasse exato R$ 53,01", () => {
  // Arrange — payment_id único (shipmentBuyerCreditToSeller = 0 pois já está em shipping_amount = 34.99)
  const result = reconcileOrderFinancials({
    grossSaleAmount: 74.95,
    orderItemsSaleFeeTotal: 8.99,
    shipmentSellerCost: 12.95,
    shipmentBuyerCreditToSeller: 0,
    payments: [
      {
        id: 184755952466,
        status: "approved",
        transaction_amount: 74.95,
        shipping_amount: 34.99,
        transaction_details: {
          net_received_amount: 53.01,
          total_paid_amount: 102.44,
        },
        charges_details: [
          {
            name: "shp_cross_docking",
            type: "shipping",
            accounts: { from: "collector", to: "1745333938" },
            amounts: { original: 47.94, refunded: 0 },
          },
          {
            name: "mp_processing_fee",
            type: "fee",
            accounts: { from: "collector", to: "mp" },
            amounts: { original: 0.07, refunded: 0 },
          },
          {
            name: "ml_sale_fee",
            type: "fee",
            accounts: { from: "collector", to: "ml" },
            amounts: { original: 8.92, refunded: 0 },
          },
        ],
      },
    ],
  });

  // Assert
  assert.equal(result.mlCommissionAmount, 8.99);
  assert.equal(result.mlShippingCost, 12.95);
  assert.equal(result.mlPromoRebate, 0);
  assert.equal(result.mpNetReleased, 53.01);
});
