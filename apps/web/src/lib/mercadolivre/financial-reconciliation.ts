import type { MlSaleOrderStatus } from "../../types/ml-sales";

export interface RawFeeDetail {
  type?: string;
  amount?: number;
  fee_payer?: string;
}

export interface RawChargeDetail {
  name?: string;
  type?: string;
  accounts?: { from?: string; to?: string };
  amounts?: { original?: number; refunded?: number };
}

export interface RawPaymentDetail {
  id: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  shipping_amount?: number;
  shipping_cost?: number;
  coupon_amount?: number;
  marketplace_fee?: number;
  mercadopago_fee?: number;
  net_received_amount?: number;
  money_release_date?: string | null;
  money_release_status?: string | null;
  transaction_details?: {
    net_received_amount?: number;
    total_paid_amount?: number;
  };
  fee_details?: RawFeeDetail[];
  charges_details?: RawChargeDetail[];
}

export interface ExtractedOrderDraft {
  ml_order_id: number;
  ml_pack_id: number | null;
  ml_shipment_id: number | null;
  ml_seller_id: string;
  store_name: string;
  order_date: string;
  shipping_deadline: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  logistic_type?: string | null;
  status: MlSaleOrderStatus;
  cancellation_reason: string | null;
  mlb_id: string;
  sku: string | null;
  product_title: string;
  product_thumbnail: string | null;
  permalink: string | null;
  quantity: number;
  buyer_name: string;
  buyer_document: string | null;
  is_business_buyer: boolean;
  gross_sale_amount: number;
  ml_commission_pct: number;
  ml_commission_amount: number;
  ml_shipping_cost: number;
  ml_promo_rebate: number;
  mp_net_released: number;
  mp_release_date: string | null;
  mp_release_status: string | null;
  shipment_fallback_seller_cost: number;
  has_consolidated_pack_payment: boolean;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isShippingChargeEntry(chName: string, chType: string): boolean {
  return (
    chType === "shipping" ||
    chName.startsWith("shp_") ||
    chName.includes("shipping")
  );
}

/**
 * Extrai e concilia tarifas ML, frete vendedor, coparticipação de frete paga pelo comprador,
 * juros repassados do comprador (`financing_transfer`/`financing_fee`) e líquido Mercado Pago.
 *
 * Regras oficiais validadas nos payloads reais do Mercado Livre / Mercado Pago:
 * 1. Quando `charges_details` existe em `/v1/payments/{id}`, ele é o razão contábil oficial:
 *    - Juros pagos pelo comprador entram (`from: "payer", to: "collector"`) e saem (`from: "collector", to: "mp"`),
 *      neutralizando-se com saldo zero para o vendedor (nunca devendo inflar a comissão ML).
 *    - Se `charges_details` não possui encargo `shipping` (`shp_*`), o vendedor pagou `R$ 0,00` de frete naquele pagamento
 *      (ex: 2º item de carrinho ou envio `d2c` absorvido pelo ML) — nunca sobrescrever com `shipmentSellerCost`.
 * 2. Em fretes `partially_free` (ex: itens < R$ 79 onde o comprador paga R$ 5,99 de frete), o ML debita o frete cheio
 *    da etiqueta (`shp_cross_docking = R$ 14,14`) no pagamento do pedido e credita a parte do comprador (`+R$ 5,99`)
 *    em um pagamento separado em `/shipments/{id}/payments` (`shipmentBuyerCreditToSeller`).
 *    O custo real de envio do vendedor é `14,14 - 5,99 = R$ 8,15` e o repasse real é `41,30 + 5,99 = R$ 47,29`.
 */
export function reconcileOrderFinancials(params: {
  grossSaleAmount: number;
  orderItemsSaleFeeTotal: number;
  payments: RawPaymentDetail[];
  shipmentSellerCost: number;
  shipmentBuyerCreditToSeller?: number;
}): {
  mlCommissionPct: number;
  mlCommissionAmount: number;
  mlShippingCost: number;
  mlPromoRebate: number;
  mpNetReleased: number;
  mpReleaseDate: string | null;
  mpReleaseStatus: string | null;
  hasConsolidatedPackPayment: boolean;
} {
  const {
    grossSaleAmount,
    orderItemsSaleFeeTotal,
    payments,
    shipmentSellerCost,
    shipmentBuyerCreditToSeller = 0,
  } = params;

  const validPayments = payments.filter(
    (p) =>
      p.status === "approved" ||
      p.status === "accredited" ||
      p.status === "in_mediation" ||
      p.status === "pending" ||
      p.status === "in_process"
  );
  const activePayments = validPayments.length > 0 ? validPayments : payments;

  let collectorCommissionFees = 0;
  let collectorShippingFees = 0;
  let explicitPromoRebate = 0;
  let mpNetSum = 0;
  let hasNetInfo = false;
  let hasDetailedCharges = false;
  let totalPaymentTransactionAmount = 0;
  let mpReleaseDate: string | null = null;
  let mpReleaseStatus: string | null = null;

  for (const p of activePayments) {
    const txAmount = Number(p.transaction_amount || 0);
    const totalPaid = Number(p.transaction_details?.total_paid_amount || 0);
    totalPaymentTransactionAmount += txAmount;

    const netVal =
      p.transaction_details?.net_received_amount ??
      (typeof p.net_received_amount === "number" ? p.net_received_amount : undefined);

    if (typeof netVal === "number" && Number.isFinite(netVal)) {
      mpNetSum += netVal;
      hasNetInfo = true;
    }

    if (p.money_release_date && !mpReleaseDate) {
      mpReleaseDate = p.money_release_date;
    }
    if (p.money_release_status && !mpReleaseStatus) {
      mpReleaseStatus = p.money_release_status;
    }

    if (Array.isArray(p.charges_details) && p.charges_details.length > 0) {
      hasDetailedCharges = true;
      let paymentFeeDebits = 0;
      let paymentShippingDebits = 0;
      let payerFeePassThrough = 0;
      let payerShippingPassThrough = 0;

      for (const ch of p.charges_details) {
        const orig = Number(ch.amounts?.original || 0);
        const refunded = Number(ch.amounts?.refunded || 0);
        const netCharge = Math.max(0, round2(orig - refunded));
        if (netCharge <= 0) continue;

        const fromAcc = (ch.accounts?.from || "").toLowerCase();
        const toAcc = (ch.accounts?.to || "").toLowerCase();
        const chType = (ch.type || "").toLowerCase();
        const chName = (ch.name || "").toLowerCase();
        const isShip = isShippingChargeEntry(chName, chType);

        if (fromAcc === "payer" && toAcc === "collector") {
          if (isShip) {
            payerShippingPassThrough += netCharge;
          } else {
            payerFeePassThrough += netCharge;
          }
          continue;
        }

        if (fromAcc === "collector") {
          if (isShip) {
            paymentShippingDebits += netCharge;
          } else {
            paymentFeeDebits += netCharge;
          }
          continue;
        }

        if (toAcc === "collector" && fromAcc !== "payer") {
          explicitPromoRebate += netCharge;
        }
      }

      const embeddedBuyerShip = round2(
        Math.max(0, Number(p.shipping_amount ?? p.shipping_cost ?? 0))
      );

      collectorCommissionFees += Math.max(
        0,
        round2(paymentFeeDebits - payerFeePassThrough)
      );
      collectorShippingFees += Math.max(
        0,
        round2(
          paymentShippingDebits -
            Math.max(payerShippingPassThrough, embeddedBuyerShip)
        )
      );
    } else if (Array.isArray(p.fee_details) && p.fee_details.length > 0) {
      for (const fee of p.fee_details) {
        if (fee.fee_payer && fee.fee_payer !== "collector") continue;
        const amount = Number(fee.amount || 0);
        const type = (fee.type || "").toLowerCase();

        // Ignora juros pagos pelo comprador quando não há charges_details
        if (
          type === "financing_fee" &&
          amount > 0 &&
          totalPaid >= txAmount + amount - 0.05
        ) {
          continue;
        }

        if (amount < 0) {
          explicitPromoRebate += Math.abs(amount);
        } else if (type.includes("shipping") || type.includes("shp")) {
          collectorShippingFees += amount;
        } else if (
          type.includes("coupon") ||
          type.includes("discount") ||
          type.includes("rebate")
        ) {
          explicitPromoRebate += amount;
        } else {
          collectorCommissionFees += amount;
        }
      }
    } else {
      collectorCommissionFees +=
        Number(p.marketplace_fee || 0) + Number(p.mercadopago_fee || 0);
      collectorShippingFees += Number(p.shipping_cost || 0);
    }
  }

  // Detecta se o pagamento retornado cobriu um carrinho maior que apenas este pedido
  const hasConsolidatedPackPayment =
    grossSaleAmount > 0 && totalPaymentTransactionAmount > grossSaleAmount * 1.05;

  const paymentRatio =
    hasConsolidatedPackPayment && totalPaymentTransactionAmount > 0
      ? grossSaleAmount / totalPaymentTransactionAmount
      : 1;

  const scaledCollectorCommission = round2(collectorCommissionFees * paymentRatio);
  const scaledCollectorShipping = round2(collectorShippingFees * paymentRatio);
  const scaledExplicitRebate = round2(explicitPromoRebate * paymentRatio);

  // Abate coparticipação de frete paga pelo comprador e creditada ao vendedor em /shipments/{id}/payments
  const cleanBuyerShipCredit = round2(Math.max(0, shipmentBuyerCreditToSeller));
  const excessShippingOverSellerCost =
    shipmentSellerCost >= 0 && scaledCollectorShipping > shipmentSellerCost
      ? round2(scaledCollectorShipping - shipmentSellerCost)
      : 0;
  const appliedBuyerShippingCredit = round2(
    Math.min(cleanBuyerShipCredit, excessShippingOverSellerCost)
  );

  const netOrderShipping = Math.max(
    0,
    round2(scaledCollectorShipping - appliedBuyerShippingCredit)
  );

  // Tarifa de comissão do ML: quando charges_details está presente, respeita sale_fee oficial vs tarifa efetiva
  let mlCommissionAmount = round2(
    Math.max(orderItemsSaleFeeTotal, scaledCollectorCommission)
  );

  // Custo de frete do vendedor: se charges_details veio preenchido, confia no débito real (pode ser 0 em packs/d2c)
  let mlShippingCost = hasDetailedCharges
    ? netOrderShipping
    : netOrderShipping > 0
    ? netOrderShipping
    : round2(shipmentSellerCost);

  let mlPromoRebate = round2(scaledExplicitRebate);
  let mpNetReleased = hasNetInfo
    ? round2(mpNetSum * paymentRatio + appliedBuyerShippingCredit)
    : round2(grossSaleAmount - mlCommissionAmount - mlShippingCost + mlPromoRebate);

  // Conciliação final exata: garante que (gross - commission - shipping + promo_rebate === mp_net_released)
  if (hasNetInfo && mpNetReleased > 0) {
    const baseWithoutRebate = round2(
      grossSaleAmount - mlCommissionAmount - mlShippingCost
    );
    const diff = round2(mpNetReleased - baseWithoutRebate);

    if (diff >= 0.01) {
      mlPromoRebate = diff;
    } else if (diff <= -0.01) {
      mlPromoRebate = 0;
      const extraCharge = Math.abs(diff);
      if (!hasDetailedCharges && mlShippingCost === 0 && shipmentSellerCost > 0) {
        const shipPart = round2(Math.min(extraCharge, shipmentSellerCost));
        mlShippingCost = shipPart;
        mlCommissionAmount = round2(mlCommissionAmount + (extraCharge - shipPart));
      } else {
        mlCommissionAmount = round2(mlCommissionAmount + extraCharge);
      }
    } else {
      mlPromoRebate = 0;
    }
  }

  if (!mpReleaseStatus) {
    if (mpReleaseDate) {
      mpReleaseStatus = Date.parse(mpReleaseDate) <= Date.now() ? "released" : "pending";
    } else {
      mpReleaseStatus = "pending";
    }
  }

  const mlCommissionPct =
    grossSaleAmount > 0 ? round2((mlCommissionAmount / grossSaleAmount) * 100) : 0;

  return {
    mlCommissionPct,
    mlCommissionAmount,
    mlShippingCost,
    mlPromoRebate,
    mpNetReleased,
    mpReleaseDate,
    mpReleaseStatus,
    hasConsolidatedPackPayment,
  };
}

/**
 * Rateio proporcional de frete em carrinhos (`ml_pack_id`) quando 2+ pedidos compartilham
 * o mesmo envio e o ML concentrou o frete em apenas um pedido (ou fallback duplicou o frete).
 */
export function applyPackShippingProration(drafts: ExtractedOrderDraft[]): void {
  const byPack = new Map<number, ExtractedOrderDraft[]>();

  for (const d of drafts) {
    if (!d.ml_pack_id) continue;
    if (d.status === "cancelled" || d.status === "returned") continue;
    const list = byPack.get(d.ml_pack_id) ?? [];
    list.push(d);
    byPack.set(d.ml_pack_id, list);
  }

  for (const packOrders of Array.from(byPack.values())) {
    if (packOrders.length <= 1) continue;

    const totalPackGross = packOrders.reduce((acc, o) => acc + o.gross_sale_amount, 0);
    if (totalPackGross <= 0) continue;

    const ordersWithShipping = packOrders.filter((o) => o.ml_shipping_cost > 0);
    const sumRecordedShipping = round2(
      packOrders.reduce((acc, o) => acc + o.ml_shipping_cost, 0)
    );
    const maxShipmentFallback = round2(
      Math.max(...packOrders.map((o) => o.shipment_fallback_seller_cost))
    );

    const isDuplicatedShipmentCost =
      maxShipmentFallback > 0 &&
      ordersWithShipping.length === packOrders.length &&
      Math.abs(sumRecordedShipping - maxShipmentFallback * packOrders.length) <= 0.05;

    const isConcentratedOnSingleOrder =
      sumRecordedShipping > 0 && ordersWithShipping.length === 1;

    if (!isDuplicatedShipmentCost && !isConcentratedOnSingleOrder) continue;

    const packTotalShipping = isDuplicatedShipmentCost
      ? maxShipmentFallback
      : sumRecordedShipping;

    let allocatedSoFar = 0;
    packOrders.forEach((order, idx) => {
      const oldShipping = order.ml_shipping_cost;
      const newShipping =
        idx === packOrders.length - 1
          ? round2(packTotalShipping - allocatedSoFar)
          : round2(packTotalShipping * (order.gross_sale_amount / totalPackGross));

      allocatedSoFar = round2(allocatedSoFar + newShipping);
      const shippingDelta = round2(newShipping - oldShipping);

      order.ml_shipping_cost = newShipping;
      order.mp_net_released = round2(order.mp_net_released - shippingDelta);
    });
  }
}
