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
  SalesAnalysisMode,
} from "@/types/ml-sales";
import { isMissingColumnError } from "./tenant-scope";
import {
  applyPackShippingProration,
  reconcileOrderFinancials,
  type ExtractedOrderDraft,
  type RawChargeDetail,
  type RawFeeDetail,
  type RawPaymentDetail,
} from "./financial-reconciliation";

import {
  extractShipmentDatesAndLogistics,
  isValidIsoTimestamp,
  normalizeManualShippedAtInput,
  normalizeSyncIsoRange,
  SHIPPING_LOOKBACK_DAYS,
  splitIsoRangeIntoMonthlyWindows,
  type RawShipmentDetail,
  type RawShipmentHistoryEntry,
  type RawShipmentStatusHistory,
  type RawShipmentTimelineEvent,
} from "./shipment-extraction";

export {
  applyPackShippingProration,
  extractShipmentDatesAndLogistics,
  normalizeManualShippedAtInput,
  normalizeSyncIsoRange,
  reconcileOrderFinancials,
  SHIPPING_LOOKBACK_DAYS,
  splitIsoRangeIntoMonthlyWindows,
  type ExtractedOrderDraft,
  type RawChargeDetail,
  type RawFeeDetail,
  type RawPaymentDetail,
  type RawShipmentDetail,
  type RawShipmentHistoryEntry,
  type RawShipmentStatusHistory,
  type RawShipmentTimelineEvent,
};

const ML_API_BASE = "https://api.mercadolibre.com";
const MP_API_BASE = "https://api.mercadopago.com";
const MAX_RETRIES = 4;
const PAGE_LIMIT = 50;
const CONCURRENCY = 5;
const MAX_FOLLOWUP_LOCAL_ORDERS = 200;

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
    variation_id?: number | null;
    variation_attributes?: Array<{
      id?: string;
      name?: string;
      value_id?: string | null;
      value_name?: string | null;
    }>;
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

interface RawShipmentCosts {
  gross_amount?: number;
  receiver?: {
    cost?: number;
    cost_details?: Array<{
      sender_id?: number | string;
      amount?: number;
    }>;
  };
  senders?: Array<{
    user_id?: number | string;
    cost?: number;
    save?: number;
    discounts?: Array<{ promoted_amount?: number; type?: string }>;
  }>;
}

interface RawShipmentPaymentEntry {
  payment_id?: number | string;
  amount?: number;
  user_id?: number | string;
  status?: string;
}

export interface CachedShipmentFinancials {
  detail: RawShipmentDetail | null;
  sellerCost: number;
  shipmentPayments?: Array<{ paymentId: string; amount: number }>;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  logisticType?: string | null;
}

function resolveOrderStatus(
  order: RawMlOrderDetail,
  payments: RawPaymentDetail[],
  shipment: RawShipmentDetail | null,
  shippedAt?: string | null
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
    if (isReturnedShipment || (hasRefundedPayment && shipment?.status === "delivered")) {
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

  if (shipment?.status === "shipped" || Boolean(shippedAt)) {
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
 * Busca todos os IDs de pedidos do período usando paginação segura em GET /orders/search,
 * fatiando automaticamente intervalos longos (ex: Ano completo ou Todas as Vendas) em janelas mensais
 * para máxima precisão e sem esbarrar no limite de offset profundo da API do Mercado Livre.
 */
async function fetchOrderIdsInPeriod(
  account: MarketplaceAccountInfo,
  tokenRef: { current: string },
  isoStart: string,
  isoEnd: string,
  maxOrders = 3000
): Promise<number[]> {
  const uniqueIds = new Set<number>();
  const windows = splitIsoRangeIntoMonthlyWindows(isoStart, isoEnd);

  for (const win of windows) {
    let offset = 0;
    while (uniqueIds.size < maxOrders && offset < 9500) {
      const searchUrl = new URL(`${ML_API_BASE}/orders/search`);
      searchUrl.searchParams.set("seller", account.seller_id);
      searchUrl.searchParams.set("order.date_created.from", win.isoStart);
      searchUrl.searchParams.set("order.date_created.to", win.isoEnd);
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

    if (uniqueIds.size >= maxOrders) break;
  }

  return Array.from(uniqueIds);
}

/**
 * Busca no Supabase local os pedidos desta conta ML que:
 * 1) Ainda estão com `status = 'paid'` (aguardando envio — podem ter sido despachados hoje mesmo comprados há semanas);
 * 2) Já estão `shipped` ou `delivered`, mas ainda estão com `shipped_at IS NULL` (backfill automático pós-migração).
 */
async function fetchFollowUpLocalOrderIds(params: {
  scope: IntegrationScope;
  sellerId: string;
}): Promise<number[]> {
  const { scope, sellerId } = params;
  const admin = createSupabaseAdminClient();
  const ids = new Set<number>();

  const applyTenant = <T extends { eq: Function; is: Function }>(q: T): T =>
    scope.organizationId
      ? q.eq("organization_id", scope.organizationId)
      : q.is("organization_id", null).eq("user_id", scope.userId);

  // 1. Pedidos pagos aguardando envio
  const paidRes = await applyTenant(
    admin
      .from("ml_sales_orders")
      .select("ml_order_id")
      .eq("ml_seller_id", sellerId)
      .eq("status", "paid")
      .order("order_date", { ascending: false })
      .limit(MAX_FOLLOWUP_LOCAL_ORDERS)
  );

  for (const row of (paidRes.data ?? []) as Array<{ ml_order_id?: number }>) {
    const n = Number(row.ml_order_id);
    if (Number.isSafeInteger(n) && n > 0) ids.add(n);
  }

  // 2. Backfill automático de pedidos já enviados/entregues ainda sem shipped_at gravado
  const backfillRes = await applyTenant(
    admin
      .from("ml_sales_orders")
      .select("ml_order_id")
      .eq("ml_seller_id", sellerId)
      .in("status", ["shipped", "delivered"])
      .is("shipped_at", null)
      .order("order_date", { ascending: false })
      .limit(MAX_FOLLOWUP_LOCAL_ORDERS)
  );

  if (!backfillRes.error) {
    for (const row of (backfillRes.data ?? []) as Array<{ ml_order_id?: number }>) {
      const n = Number(row.ml_order_id);
      if (Number.isSafeInteger(n) && n > 0) ids.add(n);
    }
  }

  return Array.from(ids);
}

/**
 * Busca detalhes de pagamento (GET /v1/payments/{id} com fallback para GET /collections/{id}).
 */
async function fetchPaymentDetail(
  paymentId: number | string,
  account: MarketplaceAccountInfo,
  tokenRef: { current: string }
): Promise<RawPaymentDetail | null> {
  // 1. Prioriza v1/payments para obter charges_details granulares (razão contábil oficial MP)
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
    const url = `${ML_API_BASE}/items?ids=${batch.join(",")}&attributes=id,thumbnail,secure_thumbnail,pictures,permalink`;
    const res = await mlReadOnlyGet<
      Array<{
        code?: number;
        body?: {
          id?: string;
          thumbnail?: string;
          secure_thumbnail?: string;
          pictures?: Array<{ secure_url?: string; url?: string }>;
          permalink?: string;
        };
      }>
    >(url, account, tokenRef);

    if (res.ok && Array.isArray(res.data)) {
      for (const entry of res.data) {
        if (entry?.code === 200 && entry.body?.id) {
          const firstPic = entry.body.pictures?.[0]?.secure_url || entry.body.pictures?.[0]?.url;
          const rawThumb = firstPic || entry.body.secure_thumbnail || entry.body.thumbnail || "";
          const thumb = rawThumb
            .replace(/^http:\/\//i, "https://")
            .replace(/-I\.(jpg|jpeg|webp|png)$/i, "-O.$1");
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

function hasShipmentEnteredTransit(
  shipment: RawShipmentDetail | null,
  order: RawMlOrderDetail
): boolean {
  const st = (shipment?.status || "").toLowerCase();
  if (st === "shipped" || st === "delivered" || st === "not_delivered") {
    return true;
  }
  const sub = (shipment?.substatus || "").toLowerCase();
  if (sub === "returned" || sub === "returning_to_sender" || sub === "in_hub") {
    return true;
  }
  const tags = Array.isArray(order.tags) ? order.tags : [];
  return tags.includes("delivered") || tags.includes("shipped");
}

/**
 * Sincroniza um único pedido completo (Order + Payments + Shipment + Timestamp Real de Envio + Coparticipação Frete + Billing Info) via GET.
 */
export async function extractSingleOrder(
  orderId: number,
  account: MarketplaceAccountInfo,
  tokenRef: { current: string },
  shipmentCache: Map<number, CachedShipmentFinancials>
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

  let baseTitle = firstItem?.title || `Pedido #${order.id}`;
  if (Array.isArray(firstItem?.variation_attributes) && firstItem.variation_attributes.length > 0) {
    const missingVars = firstItem.variation_attributes
      .filter((va) => va?.value_name && !baseTitle.toLowerCase().includes(va.value_name.toLowerCase()))
      .map((va) => (va?.name ? `${va.name}: ${va.value_name}` : va?.value_name))
      .filter(Boolean);
    if (missingVars.length > 0) {
      baseTitle = `${baseTitle} (${missingVars.join(" · ")})`;
    }
  }
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

  // Busca pagamentos detalhados em paralelo
  const rawPaymentSummaries = Array.isArray(order.payments) ? order.payments : [];
  const paymentPromises = rawPaymentSummaries
    .filter((ps) => ps?.id != null)
    .map((ps) => fetchPaymentDetail(ps.id, account, tokenRef));
  const resolvedPayments = await Promise.all(paymentPromises);
  const paymentDetails = resolvedPayments.filter(
    (p): p is RawPaymentDetail => p !== null
  );

  const orderPaymentIdSet = new Set(
    rawPaymentSummaries
      .filter((ps) => ps?.id != null)
      .map((ps) => String(ps.id))
  );

  // Busca envio, data real de postagem (status_history.date_shipped), custo do vendedor e pagamentos separados de frete
  const shipmentId = order.shipping?.id ?? null;
  let shipmentDetail: RawShipmentDetail | null = null;
  let shipmentSellerCost = 0;
  let shipmentPaymentsList: Array<{ paymentId: string; amount: number }> = [];
  let shippedAt: string | null = null;
  let deliveredAt: string | null = null;
  let logisticType: string | null = null;

  if (shipmentId) {
    const cached = shipmentCache.get(shipmentId);
    if (cached) {
      shipmentDetail = cached.detail;
      shipmentSellerCost = cached.sellerCost;
      shipmentPaymentsList = cached.shipmentPayments ?? [];
      shippedAt = cached.shippedAt ?? null;
      deliveredAt = cached.deliveredAt ?? null;
      logisticType = cached.logisticType ?? null;
    } else {
      const [shipRes, costsRes] = await Promise.all([
        mlReadOnlyGet<RawShipmentDetail>(
          `${ML_API_BASE}/shipments/${shipmentId}`,
          account,
          tokenRef,
          { "x-format-new": "true" }
        ),
        mlReadOnlyGet<RawShipmentCosts>(
          `${ML_API_BASE}/shipments/${shipmentId}/costs`,
          account,
          tokenRef,
          { "x-format-new": "true" }
        ),
      ]);

      shipmentDetail = shipRes.data ?? null;

      // Extração em cascata da data real de envio (`date_shipped`):
      // O header `x-format-new: true` traz `lead_time` e `logistic`, porém frequentemente omite `status_history`.
      // Quando o pacote já entrou em trânsito/entrega, consultamos o schema padrão `/shipments/{id}` (que contém `status_history.date_shipped`)
      // e, apenas se ainda ausente, `/shipments/{id}/tracking/timeline`.
      let classicShipmentDetail: RawShipmentDetail | null = null;
      let historyEntries: RawShipmentHistoryEntry[] | null = null;
      let timelineEvents: RawShipmentTimelineEvent[] | null = null;

      const enteredTransit = hasShipmentEnteredTransit(shipmentDetail, order);
      if (enteredTransit && !isValidIsoTimestamp(shipmentDetail?.status_history?.date_shipped)) {
        const classicRes = await mlReadOnlyGet<RawShipmentDetail>(
          `${ML_API_BASE}/shipments/${shipmentId}`,
          account,
          tokenRef
        );
        classicShipmentDetail = classicRes.data ?? null;

        if (!isValidIsoTimestamp(classicShipmentDetail?.status_history?.date_shipped)) {
          const historyRes = await mlReadOnlyGet<RawShipmentHistoryEntry[]>(
            `${ML_API_BASE}/shipments/${shipmentId}/history`,
            account,
            tokenRef
          );
          if (historyRes.ok && Array.isArray(historyRes.data)) {
            historyEntries = historyRes.data;
          }

          const hasHistoryShipped = Array.isArray(historyEntries)
            ? historyEntries.some((h) => {
                const st = (h?.status || "").toLowerCase();
                return (st === "shipped" || st === "in_transit") && isValidIsoTimestamp(h.date || h.date_created);
              })
            : false;

          if (!hasHistoryShipped) {
            const timelineRes = await mlReadOnlyGet<{
              timeline?: RawShipmentTimelineEvent[];
            }>(
              `${ML_API_BASE}/shipments/${shipmentId}/tracking/timeline`,
              account,
              tokenRef
            );
            if (timelineRes.ok && Array.isArray(timelineRes.data?.timeline)) {
              timelineEvents = timelineRes.data.timeline;
            }
          }
        }
      }

      const extractedLogistics = extractShipmentDatesAndLogistics({
        modernDetail: shipmentDetail,
        classicDetail: classicShipmentDetail,
        historyEntries,
        timelineEvents,
      });

      shippedAt = extractedLogistics.shippedAt;
      deliveredAt = extractedLogistics.deliveredAt;
      logisticType = extractedLogistics.logisticType;

      if (costsRes.ok && costsRes.data) {
        const senders = Array.isArray(costsRes.data.senders)
          ? costsRes.data.senders
          : [];
        const matchedSender =
          senders.find((s) => String(s?.user_id ?? "") === String(account.seller_id)) ??
          senders[0];

        if (matchedSender) {
          shipmentSellerCost = round2(Number(matchedSender.cost || 0));
        }

        const receiverCost = round2(Number(costsRes.data.receiver?.cost || 0));
        if (receiverCost > 0) {
          const shipPayRes = await mlReadOnlyGet<RawShipmentPaymentEntry[]>(
            `${ML_API_BASE}/shipments/${shipmentId}/payments`,
            account,
            tokenRef,
            { "x-format-new": "true" }
          );

          if (shipPayRes.ok && Array.isArray(shipPayRes.data)) {
            shipmentPaymentsList = shipPayRes.data
              .filter(
                (sp) =>
                  sp?.payment_id != null &&
                  (sp.status === "approved" ||
                    sp.status === "accredited" ||
                    sp.status === "pending" ||
                    sp.status === "in_process") &&
                  (!sp.user_id || String(sp.user_id) === String(account.seller_id))
              )
              .map((sp) => ({
                paymentId: String(sp.payment_id),
                amount: round2(Number(sp.amount || 0)),
              }));
          }
        }
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
        shipmentPayments: shipmentPaymentsList,
        shippedAt,
        deliveredAt,
        logisticType,
      });
    }
  }

  // Soma APENAS pagamentos de frete separados que NÃO sejam o próprio order.payments[0]
  const shipmentBuyerCredit = round2(
    shipmentPaymentsList
      .filter((sp) => !orderPaymentIdSet.has(sp.paymentId))
      .reduce((acc, sp) => acc + sp.amount, 0)
  );

  const shippingDeadline =
    shipmentDetail?.shipping_option?.estimated_handling_limit?.date ||
    shipmentDetail?.lead_time?.estimated_handling_limit?.date ||
    shipmentDetail?.lead_time?.buffering?.date ||
    shipmentDetail?.lead_time?.estimated_schedule_limit?.date ||
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
    shipmentDetail,
    shippedAt
  );

  const financials = reconcileOrderFinancials({
    grossSaleAmount,
    orderItemsSaleFeeTotal,
    payments: paymentDetails,
    shipmentSellerCost,
    shipmentBuyerCreditToSeller: shipmentBuyerCredit,
  });

  return {
    ml_order_id: order.id,
    ml_pack_id: order.pack_id ?? null,
    ml_shipment_id: shipmentId,
    ml_seller_id: account.seller_id,
    store_name: account.account_name || `ML ${account.seller_id}`,
    order_date: order.date_created || new Date().toISOString(),
    shipping_deadline: shippingDeadline,
    shipped_at: shippedAt,
    delivered_at: deliveredAt,
    logistic_type: logisticType,
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
    mp_net_released:
      status === "cancelled" || status === "returned" ? 0 : financials.mpNetReleased,
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
  analysisMode?: SalesAnalysisMode;
}): Promise<MlSalesSyncSummary> {
  const { scope, from, to, sellerAccountId, analysisMode = "order_date" } = params;
  const { isoStart, isoEnd } = normalizeSyncIsoRange(from, to, analysisMode);

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
      pendingOrdersChecked: 0,
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
  let pendingOrdersChecked = 0;
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
      const [periodOrderIds, followUpLocalIds] = await Promise.all([
        fetchOrderIdsInPeriod(account, tokenRef, isoStart, isoEnd),
        fetchFollowUpLocalOrderIds({ scope, sellerId: account.seller_id }),
      ]);

      pendingOrdersChecked += followUpLocalIds.length;
      const combinedOrderIds = Array.from(new Set([...periodOrderIds, ...followUpLocalIds]));
      ordersFetched += combinedOrderIds.length;

      if (combinedOrderIds.length === 0) {
        accountsSynced += 1;
        continue;
      }

      const shipmentCache = new Map<number, CachedShipmentFinancials>();

      const extracted = await mapWithConcurrency(combinedOrderIds, CONCURRENCY, (orderId) =>
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

      // Consulta pedidos já existentes no Supabase para preservar vendedor, conferência, custos manuais e shipped_at manual
      const draftOrderIds = drafts.map((d) => d.ml_order_id);
      let existingRows: Array<Record<string, unknown>> | null = null;
      let shippingColumnsAvailable = true;
      let manualShippingColumnsAvailable = true;

      const fullSelectRes = await admin
        .from("ml_sales_orders")
        .select(
          "ml_order_id, assigned_seller_id, verified_at, costs_manually_edited, tax_pct, cost_material, cost_packaging, cost_logistics, cost_printing, cost_accessories_kit, product_thumbnail, permalink, shipped_at, api_shipped_at, shipped_at_manual, delivered_at, logistic_type"
        )
        .in("ml_order_id", draftOrderIds);

      if (fullSelectRes.error && isMissingColumnError(fullSelectRes.error)) {
        manualShippingColumnsAvailable = false;
        const midSelectRes = await admin
          .from("ml_sales_orders")
          .select(
            "ml_order_id, assigned_seller_id, verified_at, costs_manually_edited, tax_pct, cost_material, cost_packaging, cost_logistics, cost_printing, cost_accessories_kit, product_thumbnail, permalink, shipped_at, delivered_at, logistic_type"
          )
          .in("ml_order_id", draftOrderIds);

        if (midSelectRes.error && isMissingColumnError(midSelectRes.error)) {
          shippingColumnsAvailable = false;
          const legacySelectRes = await admin
            .from("ml_sales_orders")
            .select(
              "ml_order_id, assigned_seller_id, verified_at, costs_manually_edited, tax_pct, cost_material, cost_packaging, cost_logistics, cost_printing, cost_accessories_kit, product_thumbnail, permalink"
            )
            .in("ml_order_id", draftOrderIds);

          if (legacySelectRes.error) {
            throw new Error(
              `Erro ao consultar ml_sales_orders (${legacySelectRes.error.message}). Verifique se a migration SQL foi executada no Supabase.`
            );
          }
          existingRows = (legacySelectRes.data ?? []) as Array<Record<string, unknown>>;
        } else if (midSelectRes.error) {
          throw new Error(
            `Erro ao consultar ml_sales_orders (${midSelectRes.error.message}). Verifique se a migration SQL foi executada no Supabase.`
          );
        } else {
          existingRows = (midSelectRes.data ?? []) as Array<Record<string, unknown>>;
        }
      } else if (fullSelectRes.error) {
        throw new Error(
          `Erro ao consultar ml_sales_orders (${fullSelectRes.error.message}). Verifique se a migration SQL foi executada no Supabase.`
        );
      } else {
        existingRows = (fullSelectRes.data ?? []) as Array<Record<string, unknown>>;
      }

      const existingMap = new Map<number, Record<string, unknown>>();
      for (const row of existingRows ?? []) {
        existingMap.set(Number(row.ml_order_id), row);
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

        const basePayload: Record<string, unknown> = {
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

        if (shippingColumnsAvailable) {
          const isManualShipped =
            manualShippingColumnsAvailable && Boolean(existing?.shipped_at_manual);
          const apiResolvedShipped =
            d.shipped_at ??
            (existing?.api_shipped_at ? String(existing.api_shipped_at) : null);

          basePayload.shipped_at = isManualShipped
            ? existing?.shipped_at
              ? String(existing.shipped_at)
              : apiResolvedShipped
            : d.shipped_at ?? (existing?.shipped_at ? String(existing.shipped_at) : null);

          if (manualShippingColumnsAvailable) {
            basePayload.shipped_at_manual = isManualShipped;
            basePayload.api_shipped_at = apiResolvedShipped;
          }

          basePayload.delivered_at =
            d.delivered_at ?? (existing?.delivered_at ? String(existing.delivered_at) : null);
          basePayload.logistic_type =
            d.logistic_type ?? (existing?.logistic_type ? String(existing.logistic_type) : null);
        }

        return basePayload;
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
    pendingOrdersChecked,
    errors,
  };
}
