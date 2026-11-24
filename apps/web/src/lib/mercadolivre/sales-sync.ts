/**
 * Serviço de Sincronização de Vendas do Mercado Livre — ESTRITAMENTE READ-ONLY (HTTP GET).
 *
 * GARANTIA DE SEGURANÇA ARQUITETURAL:
 * Nenhuma chamada POST, PUT, PATCH ou DELETE é permitida contra `api.mercadolibre.com`
 * ou `api.mercadopago.com` neste módulo. Toda persistência e conciliação ocorre exclusivamente no Supabase.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getActiveMarketplaceToken,
  getMarketplaceIntegrations,
  markReauthRequired,
  refreshMercadoLivreIntegration,
  type IntegrationScope,
  type MarketplaceAccountInfo,
} from "@/lib/services/marketplaceIntegrations";
import type {
  MlSaleOrderStatus,
  MlSalesSyncSummary,
  ProductCostTemplate,
} from "@/types/ml-sales";

const ML_API_BASE = "https://api.mercadolibre.com";
const MP_API_BASE = "https://api.mercadopago.com";
const MAX_RETRIES = 4;
const PAGE_LIMIT = 50;
const CONCURRENCY = 5;

const ALLOWED_READONLY_HOSTS = new Set([
  "api.mercadolibre.com",
  "api.mercadopago.com",
]);

export class MlReadOnlySecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MlReadOnlySecurityError";
  }
}

interface MlGetResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Guardrail central: executa EXCLUSIVAMENTE requisições HTTP GET contra a API do Mercado Livre / Mercado Pago,
 * com tratamento automático de Rate Limit (429), falhas transitórias (5xx) e renovação de access_token (401).
 */
export async function mlReadOnlyGet<T = unknown>(
  url: string,
  account: MarketplaceAccountInfo,
  tokenRef: { current: string },
  extraHeaders?: Record<string, string>
): Promise<MlGetResult<T>> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_READONLY_HOSTS.has(parsed.hostname)) {
    throw new MlReadOnlySecurityError(
      `Host bloqueado pela política de segurança Read-Only ML: ${parsed.hostname}`
    );
  }

  const requestInit: RequestInit = Object.freeze({
    method: "GET",
    cache: "no-store" as RequestCache,
  });

  if (requestInit.method !== "GET") {
    throw new MlReadOnlySecurityError("Violação crítica: apenas HTTP GET é permitido na API do ML.");
  }

  let refreshedOnce = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${tokenRef.current}`,
        ...(extraHeaders ?? {}),
      },
    });

    if (res.status === 401 && !refreshedOnce) {
      refreshedOnce = true;
      const newToken = await refreshMercadoLivreIntegration(account.id);
      if (newToken) {
        tokenRef.current = newToken;
        continue;
      }
      await markReauthRequired(account.id, "Sessão expirada durante sincronização de vendas (401).");
      return { ok: false, status: 401, data: null };
    }

    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      if (attempt < MAX_RETRIES) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterSec = retryAfterHeader ? Number.parseFloat(retryAfterHeader) : Number.NaN;
        const waitMs =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? Math.min(retryAfterSec * 1000, 15000)
            : Math.min(800 * Math.pow(2, attempt) + Math.floor(Math.random() * 350), 12000);
        await sleep(waitMs);
        continue;
      }
    }

    if (!res.ok) {
      return { ok: false, status: res.status, data: null };
    }

    const json = (await res.json().catch(() => null)) as T | null;
    return { ok: true, status: res.status, data: json };
  }

  return { ok: false, status: 429, data: null };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await worker(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

interface RawMlOrderSummary {
  id: number;
}

interface RawMlOrderItem {
  item?: {
    id?: string;
    title?: string;
    seller_sku?: string | null;
    seller_custom_field?: string | null;
  };
  quantity?: number;
  unit_price?: number;
  full_unit_price?: number;
  sale_fee?: number;
}

interface RawMlPaymentSummary {
  id: number | string;
  status?: string;
  transaction_amount?: number;
  shipping_cost?: number;
  total_paid_amount?: number;
}

interface RawMlOrderDetail {
  id: number;
  pack_id?: number | null;
  status?: string;
  status_detail?: { code?: string; description?: string } | null;
  cancel_detail?: { code?: string; description?: string } | null;
  date_created?: string;
  total_amount?: number;
  paid_amount?: number;
  tags?: string[];
  mediations?: Array<{ id?: number | string }>;
  shipping?: { id?: number | null };
  order_items?: RawMlOrderItem[];
  payments?: RawMlPaymentSummary[];
  buyer?: {
    id?: number;
    nickname?: string;
    first_name?: string;
    last_name?: string;
    billing_info?: {
      doc_type?: string;
      doc_number?: string;
    };
  };
}

interface RawFeeDetail {
  type?: string;
  amount?: number;
  fee_payer?: string;
}

interface RawChargeDetail {
  name?: string;
  type?: string;
  accounts?: { from?: string; to?: string };
  amounts?: { original?: number; refunded?: number };
}

interface RawPaymentDetail {
  id: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
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

export interface RawShipmentDetail { order_id?: number | null;
  id: number;
  status?: string;
  substatus?: string;
  shipping_option?: {
    list_cost?: number;
    cost?: number;
    estimated_handling_limit?: {
      date?: string | null;
    };
  };
  lead_time?: {
    list_cost?: number;
    cost?: number;
    estimated_handling_limit?: {
      date?: string | null;
    };
  };
}

interface RawShipmentCosts {
  gross_amount?: number;
  senders?: Array<{
    cost?: number;
    save?: number;
    discounts?: Array<{ promoted_amount?: number; type?: string }>;
  }>;
}

export interface ExtractedOrderDraft {
  ml_order_id: number;
  ml_pack_id: number | null;
  ml_shipment_id: number | null;
  ml_seller_id: string;
  store_name: string;
  order_date: string;
  shipping_deadline: string | null;
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

function normalizeIsoRange(fromInput: string, toInput: string): { isoStart: string; isoEnd: string } {
  const fromTrim = fromInput.trim();
  const toTrim = toInput.trim();

  const isoStart =
    fromTrim.length === 10 ? `${fromTrim}T00:00:00.000-03:00` : new Date(fromTrim).toISOString();
  const isoEnd =
    toTrim.length === 10 ? `${toTrim}T23:59:59.999-03:00` : new Date(toTrim).toISOString();

  return { isoStart, isoEnd };
}

function resolveOrderStatus(
  order: RawMlOrderDetail,
  payments: RawPaymentDetail[],
  shipment: RawShipmentDetail | null
): { status: MlSaleOrderStatus; cancellationReason: string | null } {
  const hasRefundedPayment =
    payments.length > 0 &&
    payments.every((p) => p.status === "refunded" || p.status === "charged_back");

  const isReturnedShipment =
    shipment?.substatus === "returned" ||
    shipment?.substatus === "returning_to_sender" ||
    shipment?.status === "not_delivered";

  const tags = Array.isArray(order.tags) ? order.tags : [];

  if (order.status === "cancelled") {
    if (isReturnedShipment || hasRefundedPayment && shipment?.status === "delivered") {
      return {
        status: "returned",
        cancellationReason:
          order.cancel_detail?.description ||
          "Pedido devolvido / reembolsado após envio no Mercado Livre",
      };
    }
    return {
      status: "cancelled",
      cancellationReason:
        order.cancel_detail?.description ||
        order.cancel_detail?.code ||
        "Venda cancelada no Mercado Livre",
    };
  }

  if (hasRefundedPayment || isReturnedShipment) {
    return {
      status: "returned",
      cancellationReason:
        order.cancel_detail?.description || "Devolução / estorno integral ao comprador",
    };
  }

  if (shipment?.status === "delivered" || tags.includes("delivered")) {
    return { status: "delivered", cancellationReason: null };
  }

  if (shipment?.status === "shipped") {
    return { status: "shipped", cancellationReason: null };
  }

  return { status: "paid", cancellationReason: null };
}

function detectDocumentInfo(
  docType?: string | null,
  docNumber?: string | null
): { document: string | null; isBusiness: boolean } {
  if (!docNumber) return { document: null, isBusiness: false };
  const cleanDigits = docNumber.replace(/\D/g, "");
  if (!cleanDigits) return { document: docNumber.trim(), isBusiness: false };

  const normalizedType = (docType || "").toUpperCase();
  const isCnpj = normalizedType === "CNPJ" || cleanDigits.length === 14;
  return {
    document: cleanDigits,
    isBusiness: isCnpj,
  };
}

/**
 * Busca todos os IDs de pedidos do período usando paginação segura em GET /orders/search.
 */
async function fetchOrderIdsInPeriod(
  account: MarketplaceAccountInfo,
  tokenRef: { current: string },
  isoStart: string,
  isoEnd: string,
  maxOrders = 1500
): Promise<number[]> {
  const uniqueIds = new Set<number>();
  let offset = 0;

  while (uniqueIds.size < maxOrders) {
    const searchUrl = new URL(`${ML_API_BASE}/orders/search`);
    searchUrl.searchParams.set("seller", account.seller_id);
    searchUrl.searchParams.set("order.date_created.from", isoStart);
    searchUrl.searchParams.set("order.date_created.to", isoEnd);
    searchUrl.searchParams.set("sort", "date_desc");
    searchUrl.searchParams.set("limit", String(PAGE_LIMIT));
    searchUrl.searchParams.set("offset", String(offset));

    const res = await mlReadOnlyGet<{
      results?: RawMlOrderSummary[];
      paging?: { total?: number; limit?: number; offset?: number };
    }>(searchUrl.toString(), account, tokenRef);

    if (!res.ok || !res.data) break;

    const results = Array.isArray(res.data.results) ? res.data.results : [];
    if (results.length === 0) break;

    for (const item of results) {
      if (item && typeof item.id === "number") {
        uniqueIds.add(item.id);
      }
    }

    const total = res.data.paging?.total ?? results.length;
    offset += PAGE_LIMIT;
    if (offset >= total || results.length < PAGE_LIMIT) break;
  }

  return Array.from(uniqueIds);
}

/**
 * Busca detalhes de pagamento (GET /collections/{id} com fallback para GET /v1/payments/{id}).
 */
async function fetchPaymentDetail(
  paymentId: number | string,
  account: MarketplaceAccountInfo,
  tokenRef: { current: string }
): Promise<RawPaymentDetail | null> {
  // 1. Tenta v1/payments para obter fee_details + charges_details granulares
  const mpRes = await mlReadOnlyGet<RawPaymentDetail>(
    `${MP_API_BASE}/v1/payments/${encodeURIComponent(String(paymentId))}`,
    account,
    tokenRef
  );
  if (mpRes.ok && mpRes.data) {
    return mpRes.data;
  }

  // 2. Fallback para GET /collections/{payment_id} em api.mercadolibre.com
  const colRes = await mlReadOnlyGet<RawPaymentDetail>(
    `${ML_API_BASE}/collections/${encodeURIComponent(String(paymentId))}`,
    account,
    tokenRef
  );
  if (colRes.ok && colRes.data) {
    return colRes.data;
  }

  return null;
}

/**
 * Busca miniaturas e permalinks em lote via GET /items?ids=... (máx 20 por chamada).
 */
export async function fetchItemThumbnailsMap(
  mlbIds: string[],
  account: MarketplaceAccountInfo,
  tokenRef: { current: string }
): Promise<Map<string, { thumbnail: string | null; permalink: string | null }>> {
  const result = new Map<string, { thumbnail: string | null; permalink: string | null }>();
  if (mlbIds.length === 0) return result;

  // Primeiro reaproveita miniaturas já salvas localmente em my_listings
  const admin = createSupabaseAdminClient();
  const { data: localListings } = await admin
    .from("my_listings")
    .select("external_id, thumbnail_url, permalink")
    .in("external_id", mlbIds);

  for (const row of localListings ?? []) {
    if (row.external_id && row.thumbnail_url) {
      result.set(String(row.external_id).toUpperCase(), {
        thumbnail: String(row.thumbnail_url).replace(/^http:\/\//i, "https://"),
        permalink: row.permalink ?? null,
      });
    }
  }

  const missingIds = mlbIds.filter((id) => !result.has(id));
  for (let i = 0; i < missingIds.length; i += 20) {
    const batch = missingIds.slice(i, i + 20);
    const url = `${ML_API_BASE}/items?ids=${batch.join(",")}&attributes=id,thumbnail,secure_thumbnail,permalink`;
    const res = await mlReadOnlyGet<
      Array<{
        code?: number;
        body?: {
          id?: string;
          thumbnail?: string;
          secure_thumbnail?: string;
          permalink?: string;
        };
      }>
    >(url, account, tokenRef);

    if (res.ok && Array.isArray(res.data)) {
      for (const entry of res.data) {
        if (entry?.code === 200 && entry.body?.id) {
          const thumb = (entry.body.secure_thumbnail || entry.body.thumbnail || "").replace(
            /^http:\/\//i,
            "https://"
          );
          result.set(entry.body.id.toUpperCase(), {
            thumbnail: thumb || null,
            permalink: entry.body.permalink || null,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Extrai e concilia tarifas ML, frete vendedor, estorno/redução promocional e líquido Mercado Pago.
 */
export function reconcileOrderFinancials(params: {
  grossSaleAmount: number;
  orderItemsSaleFeeTotal: number;
  payments: RawPaymentDetail[];
  shipmentSellerCost: number;
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
  const { grossSaleAmount, orderItemsSaleFeeTotal, payments, shipmentSellerCost } = params;

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
  let totalPaymentTransactionAmount = 0;
  let mpReleaseDate: string | null = null;
  let mpReleaseStatus: string | null = null;

  for (const p of activePayments) {
    totalPaymentTransactionAmount += Number(p.transaction_amount || 0);

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

    if (Array.isArray(p.fee_details) && p.fee_details.length > 0) {
      for (const fee of p.fee_details) {
        if (fee.fee_payer && fee.fee_payer !== "collector") continue;
        const amount = Number(fee.amount || 0);
        const type = (fee.type || "").toLowerCase();

        if (amount < 0) {
          explicitPromoRebate += Math.abs(amount);
        } else if (type.includes("shipping") || type.includes("shp")) {
          collectorShippingFees += amount;
        } else if (type.includes("coupon") || type.includes("discount") || type.includes("rebate")) {
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

    // Inspeciona charges_details para subsídios/bonificações explícitas de campanha ML
    if (Array.isArray(p.charges_details)) {
      for (const ch of p.charges_details) {
        const toCollector = ch.accounts?.to === "collector";
        const orig = Number(ch.amounts?.original || 0);
        const chName = `${ch.name || ""} ${ch.type || ""}`.toLowerCase();
        if (
          toCollector &&
          orig > 0 &&
          (chName.includes("campaign") ||
            chName.includes("rebate") ||
            chName.includes("subsidy") ||
            chName.includes("discount") ||
            chName.includes("bonif"))
        ) {
          explicitPromoRebate = Math.max(explicitPromoRebate, orig);
        }
      }
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

  // Tarifa cheia de comissão do ML: maior valor entre sale_fee do pedido e fee cobrada no pagamento
  let mlCommissionAmount = round2(
    Math.max(orderItemsSaleFeeTotal, scaledCollectorCommission)
  );

  // Custo de frete do vendedor: prioriza pagamento; se ausente e não for carrinho consolidado, usa custo do shipment
  let mlShippingCost =
    scaledCollectorShipping > 0
      ? scaledCollectorShipping
      : round2(shipmentSellerCost);

  let mlPromoRebate = round2(scaledExplicitRebate);
  let mpNetReleased = hasNetInfo
    ? round2(mpNetSum * paymentRatio)
    : round2(grossSaleAmount - mlCommissionAmount - mlShippingCost + mlPromoRebate);

  // Conciliação exata: garante que (gross - commission - shipping + promo_rebate === mp_net_released)
  if (hasNetInfo && mpNetReleased > 0) {
    const baseWithoutRebate = round2(grossSaleAmount - mlCommissionAmount - mlShippingCost);
    const diff = round2(mpNetReleased - baseWithoutRebate);

    if (diff > 0) {
      // O Mercado Pago liberou MAIS do que (Bruto - Tarifa Cheia - Frete) => Estorno / Redução Promocional ML!
      mlPromoRebate = diff;
    } else if (diff < 0) {
      // Havia encargo adicional do ML/MP (ex: tarifa de parcelamento ou diferença de frete) não refletido no sale_fee
      mlPromoRebate = 0;
      const extraCharge = Math.abs(diff);
      if (mlShippingCost === 0 && shipmentSellerCost > 0) {
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

  // Determina status de liberação caso não informado explicitamente pela API
  if (!mpReleaseStatus) {
    if (mpReleaseDate) {
      mpReleaseStatus = Date.parse(mpReleaseDate) <= Date.now() ? "released" : "pending";
    } else {
      mpReleaseStatus = hasNetInfo ? "pending" : "pending";
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
 * Aplica Opção A (Socratic Gate): Rateio proporcional de frete em carrinhos (`ml_pack_id`)
 * quando 2+ pedidos compartilham o mesmo envio e o ML concentrou o frete em apenas um pedido.
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

    // Caso 1: Todos os pedidos receberam o custo cheio do mesmo shipment duplicado
    const isDuplicatedShipmentCost =
      maxShipmentFallback > 0 &&
      ordersWithShipping.length === packOrders.length &&
      Math.abs(sumRecordedShipping - maxShipmentFallback * packOrders.length) <= 0.05;

    // Caso 2: Apenas 1 pedido do carrinho absorveu 100% do frete enquanto os demais ficaram com 0
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
      // Ajusta mp_net_released proporcionalmente à redistribuição do frete entre os pedidos do pack
      order.mp_net_released = round2(order.mp_net_released - shippingDelta);
    });
  }
}

/**
 * Sincroniza um único pedido completo (Order + Payments + Shipment + Billing Info) via GET.
 */
export async function extractSingleOrder(
  orderId: number,
  account: MarketplaceAccountInfo,
  tokenRef: { current: string },
  shipmentCache: Map<number, { detail: RawShipmentDetail | null; sellerCost: number }>
): Promise<ExtractedOrderDraft | null> {
  const orderRes = await mlReadOnlyGet<RawMlOrderDetail>(
    `${ML_API_BASE}/orders/${orderId}`,
    account,
    tokenRef
  );
  if (!orderRes.ok || !orderRes.data) return null;

  const order = orderRes.data;
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const firstItem = items[0]?.item;

  const mlbId = (firstItem?.id || "MLB000000000").toUpperCase();
  const sku = firstItem?.seller_sku || firstItem?.seller_custom_field || null;
  const totalQty = Math.max(
    1,
    items.reduce((sum, oi) => sum + Number(oi.quantity || 1), 0)
  );

  const baseTitle = firstItem?.title || `Pedido #${order.id}`;
  const productTitle =
    items.length > 1 ? `${baseTitle} (+${items.length - 1} item)` : baseTitle;

  const grossSaleAmount = round2(
    items.length > 0
      ? items.reduce(
          (sum, oi) => sum + Number(oi.unit_price || 0) * Number(oi.quantity || 1),
          0
        )
      : Number(order.total_amount || 0)
  );

  const orderItemsSaleFeeTotal = round2(
    items.reduce(
      (sum, oi) => sum + Number(oi.sale_fee || 0) * Number(oi.quantity || 1),
      0
    )
  );

  // Busca pagamentos detalhados
  const rawPaymentSummaries = Array.isArray(order.payments) ? order.payments : [];
  const paymentDetails: RawPaymentDetail[] = [];
  for (const ps of rawPaymentSummaries) {
    if (ps?.id == null) continue;
    const detail = await fetchPaymentDetail(ps.id, account, tokenRef);
    if (detail) paymentDetails.push(detail);
  }

  // Busca envio e prazo "Enviar dia" (com cache para pedidos do mesmo carrinho)
  const shipmentId = order.shipping?.id ?? null;
  let shipmentDetail: RawShipmentDetail | null = null;
  let shipmentSellerCost = 0;

  if (shipmentId) {
    const cached = shipmentCache.get(shipmentId);
    if (cached) {
      shipmentDetail = cached.detail;
      shipmentSellerCost = cached.sellerCost;
    } else {
      const shipRes = await mlReadOnlyGet<RawShipmentDetail>(
        `${ML_API_BASE}/shipments/${shipmentId}`,
        account,
        tokenRef,
        { "x-format-new": "true" }
      );
      shipmentDetail = shipRes.data ?? null;

      // Consulta complementar de custos do envio quando pago pelo vendedor
      const costsRes = await mlReadOnlyGet<RawShipmentCosts>(
        `${ML_API_BASE}/shipments/${shipmentId}/costs`,
        account,
        tokenRef,
        { "x-format-new": "true" }
      );
      if (costsRes.ok && costsRes.data?.senders?.[0]) {
        shipmentSellerCost = round2(Number(costsRes.data.senders[0].cost || 0));
      } else {
        shipmentSellerCost = round2(
          Number(
            shipmentDetail?.lead_time?.list_cost ??
              shipmentDetail?.shipping_option?.list_cost ??
              0
          )
        );
      }

      shipmentCache.set(shipmentId, {
        detail: shipmentDetail,
        sellerCost: shipmentSellerCost,
      });
    }
  }

  const shippingDeadline =
    shipmentDetail?.shipping_option?.estimated_handling_limit?.date ||
    shipmentDetail?.lead_time?.estimated_handling_limit?.date ||
    null;

  // Dados do comprador + CPF/CNPJ (Tag Negócio)
  const buyerFullName = [order.buyer?.first_name, order.buyer?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const buyerName = buyerFullName || order.buyer?.nickname || "Comprador Mercado Livre";

  let docInfo = detectDocumentInfo(
    order.buyer?.billing_info?.doc_type,
    order.buyer?.billing_info?.doc_number
  );

  if (!docInfo.document) {
    const billingRes = await mlReadOnlyGet<{
      billing_info?: {
        doc_type?: string;
        doc_number?: string;
        additional_info?: Array<{ type?: string; value?: string }>;
      };
      buyer?: {
        billing_info?: {
          identification?: { type?: string; number?: string };
          doc_type?: string;
          doc_number?: string;
        };
      };
    }>(`${ML_API_BASE}/orders/${orderId}/billing_info`, account, tokenRef);

    if (billingRes.ok && billingRes.data) {
      const b = billingRes.data;
      const docType =
        b.buyer?.billing_info?.identification?.type ||
        b.buyer?.billing_info?.doc_type ||
        b.billing_info?.doc_type ||
        null;
      const docNumber =
        b.buyer?.billing_info?.identification?.number ||
        b.buyer?.billing_info?.doc_number ||
        b.billing_info?.doc_number ||
        null;
      docInfo = detectDocumentInfo(docType, docNumber);
    }
  }

  const { status, cancellationReason } = resolveOrderStatus(
    order,
    paymentDetails,
    shipmentDetail
  );

  const financials = reconcileOrderFinancials({
    grossSaleAmount,
    orderItemsSaleFeeTotal,
    payments: paymentDetails,
    shipmentSellerCost,
  });

  return {
    ml_order_id: order.id,
    ml_pack_id: order.pack_id ?? null,
    ml_shipment_id: shipmentId,
    ml_seller_id: account.seller_id,
    store_name: account.account_name || `ML ${account.seller_id}`,
    order_date: order.date_created || new Date().toISOString(),
    shipping_deadline: shippingDeadline,
    status,
    cancellation_reason: cancellationReason,
    mlb_id: mlbId,
    sku,
    product_title: productTitle,
    product_thumbnail: null,
    permalink: null,
    quantity: totalQty,
    buyer_name: buyerName,
    buyer_document: docInfo.document,
    is_business_buyer: docInfo.isBusiness,
    gross_sale_amount: grossSaleAmount,
    ml_commission_pct: financials.mlCommissionPct,
    ml_commission_amount: financials.mlCommissionAmount,
    ml_shipping_cost: financials.mlShippingCost,
    ml_promo_rebate: financials.mlPromoRebate,
    mp_net_released: status === "cancelled" || status === "returned" ? 0 : financials.mpNetReleased,
    mp_release_date: financials.mpReleaseDate,
    mp_release_status:
      status === "cancelled" || status === "returned"
        ? "cancelled"
        : financials.mpReleaseStatus,
    shipment_fallback_seller_cost: shipmentSellerCost,
    has_consolidated_pack_payment: financials.hasConsolidatedPackPayment,
  };
}

/**
 * Executa a sincronização completa Read-Only de todas as contas ML ativas da organização/usuário
 * e faz Upsert seguro em `ml_sales_orders` preservando edições manuais de vendedor e custos.
 */
export async function syncMercadoLivreSales(params: {
  scope: IntegrationScope;
  from: string;
  to: string;
  sellerAccountId?: string;
}): Promise<MlSalesSyncSummary> {
  const { scope, from, to, sellerAccountId } = params;
  const { isoStart, isoEnd } = normalizeIsoRange(from, to);

  const allIntegrations = await getMarketplaceIntegrations(scope);
  const mlAccounts = allIntegrations.filter(
    (acc) =>
      acc.platform === "mercadolivre" &&
      acc.is_active &&
      acc.status !== "reauth_required" &&
      (!sellerAccountId || acc.seller_id === sellerAccountId || acc.id === sellerAccountId)
  );

  if (mlAccounts.length === 0) {
    return {
      success: false,
      accountsSynced: 0,
      ordersFetched: 0,
      ordersUpserted: 0,
      errors: [
        {
          account: "Mercado Livre",
          message:
            "Nenhuma conta do Mercado Livre ativa encontrada. Conecte sua loja em Configurações & APIs.",
        },
      ],
    };
  }

  const admin = createSupabaseAdminClient();

  // Carrega templates de custo/vendedor padrão do tenant
  let templatesQuery = admin.from("product_cost_templates").select("*");
  templatesQuery = scope.organizationId
    ? templatesQuery.eq("organization_id", scope.organizationId)
    : templatesQuery.eq("user_id", scope.userId);
  const { data: templateRows } = await templatesQuery;

  const templatesByMlb = new Map<string, ProductCostTemplate>();
  for (const tpl of (templateRows ?? []) as ProductCostTemplate[]) {
    templatesByMlb.set(tpl.mlb_id.toUpperCase(), tpl);
  }

  let accountsSynced = 0;
  let ordersFetched = 0;
  let ordersUpserted = 0;
  const errors: Array<{ account: string; message: string }> = [];

  for (const account of mlAccounts) {
    try {
      const initialToken = await getActiveMarketplaceToken(
        "mercadolivre",
        scope,
        account.seller_id
      );
      if (!initialToken) {
        errors.push({
          account: account.account_name,
          message: "Token expirado ou pendente de reconexão OAuth.",
        });
        continue;
      }

      const tokenRef = { current: initialToken };
      const orderIds = await fetchOrderIdsInPeriod(account, tokenRef, isoStart, isoEnd);
      ordersFetched += orderIds.length;

      if (orderIds.length === 0) {
        accountsSynced += 1;
        continue;
      }

      const shipmentCache = new Map<
        number,
        { detail: RawShipmentDetail | null; sellerCost: number }
      >();

      const extracted = await mapWithConcurrency(orderIds, CONCURRENCY, (orderId) =>
        extractSingleOrder(orderId, account, tokenRef, shipmentCache)
      );

      const drafts = extracted.filter((d): d is ExtractedOrderDraft => d !== null);

      // Aplica rateio proporcional de frete para carrinhos com múltiplos pedidos
      applyPackShippingProration(drafts);

      // Enriquece miniaturas e links dos anúncios
      const distinctMlbs = Array.from(new Set(drafts.map((d) => d.mlb_id)));
      const thumbMap = await fetchItemThumbnailsMap(distinctMlbs, account, tokenRef);
      for (const d of drafts) {
        const meta = thumbMap.get(d.mlb_id);
        if (meta) {
          d.product_thumbnail = meta.thumbnail;
          d.permalink = meta.permalink;
        }
      }

      // Consulta pedidos já existentes no Supabase para preservar vendedor, conferência e custos manuais
      const { data: existingRows, error: existingErr } = await admin
        .from("ml_sales_orders")
        .select(
          "ml_order_id, assigned_seller_id, verified_at, costs_manually_edited, tax_pct, cost_material, cost_packaging, cost_logistics, cost_printing, cost_accessories_kit, product_thumbnail, permalink"
        )
        .in(
          "ml_order_id",
          drafts.map((d) => d.ml_order_id)
        );

      if (existingErr) {
        throw new Error(
          `Erro ao consultar ml_sales_orders (${existingErr.message}). Verifique se a migration SQL foi executada no Supabase.`
        );
      }

      const existingMap = new Map<number, Record<string, unknown>>();
      for (const row of existingRows ?? []) {
        existingMap.set(Number(row.ml_order_id), row as Record<string, unknown>);
      }

      const upsertPayloads = drafts.map((d) => {
        const existing = existingMap.get(d.ml_order_id);
        const tpl = templatesByMlb.get(d.mlb_id);

        const existingAssignedSeller =
          existing && existing.assigned_seller_id
            ? String(existing.assigned_seller_id)
            : null;
        const resolvedSellerId =
          existingAssignedSeller ?? (tpl?.default_seller_id || null);

        const preserveManualCosts = Boolean(existing?.costs_manually_edited);

        const taxPct = preserveManualCosts
          ? Number(existing?.tax_pct ?? 0)
          : tpl
          ? Number(tpl.default_tax_pct)
          : Number(existing?.tax_pct ?? 0);

        const costMaterial = preserveManualCosts
          ? Number(existing?.cost_material ?? 0)
          : tpl
          ? round2(Number(tpl.material_cost) * d.quantity)
          : Number(existing?.cost_material ?? 0);

        const costPackaging = preserveManualCosts
          ? Number(existing?.cost_packaging ?? 0)
          : tpl
          ? round2(Number(tpl.packaging_cost))
          : Number(existing?.cost_packaging ?? 0);

        const costLogistics = preserveManualCosts
          ? Number(existing?.cost_logistics ?? 0)
          : tpl
          ? round2(Number(tpl.logistics_cost))
          : Number(existing?.cost_logistics ?? 0);

        const costPrinting = preserveManualCosts
          ? Number(existing?.cost_printing ?? 0)
          : tpl
          ? round2(Number(tpl.printing_cost))
          : Number(existing?.cost_printing ?? 0);

        const costAccessoriesKit = preserveManualCosts
          ? Number(existing?.cost_accessories_kit ?? 0)
          : tpl
          ? round2(Number(tpl.accessories_kit_cost) * d.quantity)
          : Number(existing?.cost_accessories_kit ?? 0);

        return {
          organization_id: scope.organizationId,
          user_id: scope.userId,
          ml_order_id: d.ml_order_id,
          ml_pack_id: d.ml_pack_id,
          ml_shipment_id: d.ml_shipment_id,
          ml_seller_id: d.ml_seller_id,
          store_name: d.store_name,
          order_date: d.order_date,
          shipping_deadline: d.shipping_deadline,
          status: d.status,
          cancellation_reason: d.cancellation_reason,
          mlb_id: d.mlb_id,
          sku: d.sku ?? tpl?.sku ?? null,
          product_title: d.product_title,
          product_thumbnail:
            d.product_thumbnail ??
            (existing?.product_thumbnail ? String(existing.product_thumbnail) : null),
          permalink:
            d.permalink ??
            (existing?.permalink
              ? String(existing.permalink)
              : `https://produto.mercadolivre.com.br/${d.mlb_id.replace(/^MLB(\d+)/i, "MLB-$1")}`),
          quantity: d.quantity,
          buyer_name: d.buyer_name,
          buyer_document: d.buyer_document,
          is_business_buyer: d.is_business_buyer,
          assigned_seller_id: resolvedSellerId,
          verified_at: existing?.verified_at ? String(existing.verified_at) : null,
          costs_manually_edited: preserveManualCosts,
          gross_sale_amount: d.gross_sale_amount,
          ml_commission_pct: d.ml_commission_pct,
          ml_commission_amount: d.ml_commission_amount,
          ml_shipping_cost: d.ml_shipping_cost,
          ml_promo_rebate: d.ml_promo_rebate,
          mp_net_released: d.mp_net_released,
          mp_release_date: d.mp_release_date,
          mp_release_status: d.mp_release_status,
          tax_pct: taxPct,
          cost_material: costMaterial,
          cost_packaging: costPackaging,
          cost_logistics: costLogistics,
          cost_printing: costPrinting,
          cost_accessories_kit: costAccessoriesKit,
        };
      });

      // Upsert em lotes de 100 registros em ml_order_id
      for (let i = 0; i < upsertPayloads.length; i += 100) {
        const chunk = upsertPayloads.slice(i, i + 100);
        const { error: upsertErr } = await admin
          .from("ml_sales_orders")
          .upsert(chunk, { onConflict: "ml_order_id" });

        if (upsertErr) {
          throw new Error(`Falha ao salvar pedidos no Supabase: ${upsertErr.message}`);
        }
        ordersUpserted += chunk.length;
      }

      accountsSynced += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha inesperada na sincronização ML";
      errors.push({ account: account.account_name, message: msg });
    }
  }

  return {
    success: accountsSynced > 0 || errors.length === 0,
    accountsSynced,
    ordersFetched,
    ordersUpserted,
    errors,
  };
}
