/**
 * Sincronização Unitária em Tempo Real para Webhooks do Mercado Livre (100% Read-Only HTTP GET).
 * Otimizada para execução sub-segundo em Vercel Hobby (Free) e consumo mínimo no Supabase Free.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getActiveMarketplaceToken,
  type IntegrationScope,
  type MarketplaceAccountInfo,
} from "@/lib/services/marketplaceIntegrations";
import {
  applyPackShippingProration,
  extractSingleOrder,
  fetchItemThumbnailsMap,
  mlReadOnlyGet,
  type CachedShipmentFinancials,
  type ExtractedOrderDraft,
  type RawShipmentDetail,
} from "@/lib/mercadolivre/sales-sync";
import { isMissingColumnError } from "@/lib/mercadolivre/tenant-scope";
import type { ProductCostTemplate } from "@/types/ml-sales";

const ML_API_BASE = "https://api.mercadolibre.com";
const MAX_PACK_SIBLINGS = 8;

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapMlListingStatus(rawStatus?: string | null): "active" | "paused" | "closed" {
  if (rawStatus === "active") return "active";
  if (rawStatus === "paused" || rawStatus === "under_review") return "paused";
  return "closed";
}

interface ResolvedSellerContext {
  scope: IntegrationScope;
  account: MarketplaceAccountInfo;
  tokenRef: { current: string };
}

async function resolveActiveMlSellerContext(
  sellerId: string
): Promise<ResolvedSellerContext | null> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("marketplace_integrations")
    .select(
      "id, user_id, organization_id, platform, account_name, seller_id, is_active, status, created_at, token_expires_at, metadata"
    )
    .eq("platform", "mercadolivre")
    .eq("seller_id", sellerId)
    .eq("is_active", true)
    .neq("status", "reauth_required")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || !row.user_id) return null;

  const scope: IntegrationScope = {
    userId: String(row.user_id),
    organizationId: row.organization_id ? String(row.organization_id) : null,
  };

  const account: MarketplaceAccountInfo = {
    id: String(row.id),
    platform: "mercadolivre",
    account_name: String(row.account_name || `ML ${sellerId}`),
    seller_id: String(row.seller_id),
    is_active: Boolean(row.is_active),
    connected_at: String(row.created_at),
    token_expires_at: row.token_expires_at ? String(row.token_expires_at) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    status: "online",
  };

  const token = await getActiveMarketplaceToken("mercadolivre", scope, account.seller_id);
  if (!token) return null;

  return {
    scope,
    account,
    tokenRef: { current: token },
  };
}

interface LiveItemStockBody {
  id?: string;
  available_quantity?: number;
  sold_quantity?: number;
  status?: string;
  variations?: Array<{
    id?: number | string;
    available_quantity?: number;
    sold_quantity?: number;
  }>;
}

/**
 * Atualiza `available_quantity`, `sold_quantity`, `status` e estoque de variações em `my_listings`
 * usando apenas 1 requisição Read-Only `GET /items?ids=...`.
 */
export async function syncListingsStockInCatalog(params: {
  mlbIds: string[];
  account: MarketplaceAccountInfo;
  tokenRef: { current: string };
}): Promise<number> {
  const uniqueIds = Array.from(
    new Set(params.mlbIds.map((id) => id.trim().toUpperCase()).filter(Boolean))
  );
  if (uniqueIds.length === 0) return 0;

  const admin = createSupabaseAdminClient();
  const { data: localListings } = await admin
    .from("my_listings")
    .select("id, external_id, variations")
    .eq("platform", "mercadolivre")
    .in("external_id", uniqueIds);

  if (!localListings || localListings.length === 0) return 0;

  const localByMlb = new Map<
    string,
    Array<{ id: string; variations: Array<Record<string, unknown>> }>
  >();

  for (const row of localListings) {
    if (!row.external_id) continue;
    const key = String(row.external_id).toUpperCase();
    const list = localByMlb.get(key) ?? [];
    list.push({
      id: String(row.id),
      variations: Array.isArray(row.variations)
        ? (row.variations as Array<Record<string, unknown>>)
        : [],
    });
    localByMlb.set(key, list);
  }

  const matchedMlbIds = Array.from(localByMlb.keys());
  let updatedCount = 0;

  for (let i = 0; i < matchedMlbIds.length; i += 20) {
    const batch = matchedMlbIds.slice(i, i + 20);
    const url = `${ML_API_BASE}/items?ids=${batch.join(",")}&attributes=id,available_quantity,sold_quantity,status,variations`;
    const res = await mlReadOnlyGet<Array<{ code?: number; body?: LiveItemStockBody }>>(
      url,
      params.account,
      params.tokenRef
    );

    if (!res.ok || !Array.isArray(res.data)) continue;

    for (const entry of res.data) {
      const body = entry?.body;
      if (entry?.code !== 200 || !body?.id) continue;
      const mlbKey = body.id.toUpperCase();
      const targetRows = localByMlb.get(mlbKey) ?? [];

      const liveVarMap = new Map<string, { avail: number; sold: number }>();
      if (Array.isArray(body.variations)) {
        for (const v of body.variations) {
          if (v?.id != null) {
            liveVarMap.set(String(v.id), {
              avail: Math.max(0, Number(v.available_quantity ?? 0)),
              sold: Math.max(0, Number(v.sold_quantity ?? 0)),
            });
          }
        }
      }

      for (const localRow of targetRows) {
        const updatePayload: Record<string, unknown> = {
          available_quantity: Math.max(0, Number(body.available_quantity ?? 0)),
          sold_quantity: Math.max(0, Number(body.sold_quantity ?? 0)),
          status: mapMlListingStatus(body.status),
        };

        if (localRow.variations.length > 0 && liveVarMap.size > 0) {
          updatePayload.variations = localRow.variations.map((existingVar) => {
            const live = liveVarMap.get(String(existingVar.id ?? ""));
            if (!live) return existingVar;
            return {
              ...existingVar,
              available_quantity: live.avail,
              sold_quantity: live.sold,
            };
          });
        }

        const { error } = await admin
          .from("my_listings")
          .update(updatePayload)
          .eq("id", localRow.id);

        if (!error) updatedCount += 1;
      }
    }
  }

  return updatedCount;
}

async function upsertDraftsPreservingManualFields(params: {
  scope: IntegrationScope;
  drafts: ExtractedOrderDraft[];
}): Promise<number> {
  const { scope, drafts } = params;
  if (drafts.length === 0) return 0;

  const admin = createSupabaseAdminClient();
  const distinctMlbs = Array.from(new Set(drafts.map((d) => d.mlb_id)));
  const draftOrderIds = drafts.map((d) => d.ml_order_id);

  let templatesQuery = admin
    .from("product_cost_templates")
    .select("*")
    .in("mlb_id", distinctMlbs);

  templatesQuery = scope.organizationId
    ? templatesQuery.eq("organization_id", scope.organizationId)
    : templatesQuery.eq("user_id", scope.userId);

  const [{ data: templateRows }, fullSelectRes] = await Promise.all([
    templatesQuery,
    admin
      .from("ml_sales_orders")
      .select(
        "ml_order_id, assigned_seller_id, verified_at, costs_manually_edited, tax_pct, cost_material, cost_packaging, cost_logistics, cost_printing, cost_accessories_kit, product_thumbnail, permalink, shipped_at, api_shipped_at, shipped_at_manual, delivered_at, logistic_type"
      )
      .in("ml_order_id", draftOrderIds),
  ]);

  let existingRows: Array<Record<string, unknown>> = [];
  let shippingColumnsAvailable = true;
  let manualShippingColumnsAvailable = true;

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
        throw new Error(`Erro ao consultar ml_sales_orders: ${legacySelectRes.error.message}`);
      }
      existingRows = (legacySelectRes.data ?? []) as Array<Record<string, unknown>>;
    } else if (midSelectRes.error) {
      throw new Error(`Erro ao consultar ml_sales_orders: ${midSelectRes.error.message}`);
    } else {
      existingRows = (midSelectRes.data ?? []) as Array<Record<string, unknown>>;
    }
  } else if (fullSelectRes.error) {
    throw new Error(`Erro ao consultar ml_sales_orders: ${fullSelectRes.error.message}`);
  } else {
    existingRows = (fullSelectRes.data ?? []) as Array<Record<string, unknown>>;
  }

  const templatesByMlb = new Map<string, ProductCostTemplate>();
  for (const tpl of (templateRows ?? []) as ProductCostTemplate[]) {
    templatesByMlb.set(tpl.mlb_id.toUpperCase(), tpl);
  }

  const existingMap = new Map<number, Record<string, unknown>>();
  for (const row of existingRows) {
    existingMap.set(Number(row.ml_order_id), row);
  }

  const upsertPayloads = drafts.map((d) => {
    const existing = existingMap.get(d.ml_order_id);
    const tpl = templatesByMlb.get(d.mlb_id);

    const existingAssignedSeller =
      existing && existing.assigned_seller_id ? String(existing.assigned_seller_id) : null;
    const resolvedSellerId = existingAssignedSeller ?? (tpl?.default_seller_id || null);
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

  const { error: upsertErr } = await admin
    .from("ml_sales_orders")
    .upsert(upsertPayloads, { onConflict: "ml_order_id" });

  if (upsertErr) {
    throw new Error(`Falha ao salvar pedido via webhook no Supabase: ${upsertErr.message}`);
  }

  return upsertPayloads.length;
}

export interface WebhookSyncOutcome {
  synced: boolean;
  reason?: string;
  ordersUpserted: number;
  listingsUpdated: number;
}

/**
 * Sincroniza em modo Read-Only (`GET`) um pedido individual notificado pelo Webhook do ML,
 * incluindo irmãos de carrinho (`pack_id`) e atualização de estoque do anúncio em `my_listings`.
 */
export async function syncMercadoLivreSingleOrderBySeller(params: {
  sellerId: string;
  orderId: number;
}): Promise<WebhookSyncOutcome> {
  const ctx = await resolveActiveMlSellerContext(params.sellerId);
  if (!ctx) {
    return {
      synced: false,
      reason: "seller_not_connected",
      ordersUpserted: 0,
      listingsUpdated: 0,
    };
  }

  const shipmentCache = new Map<number, CachedShipmentFinancials>();

  const primaryDraft = await extractSingleOrder(
    params.orderId,
    ctx.account,
    ctx.tokenRef,
    shipmentCache
  );

  if (!primaryDraft) {
    return {
      synced: false,
      reason: "order_not_found",
      ordersUpserted: 0,
      listingsUpdated: 0,
    };
  }

  const drafts: ExtractedOrderDraft[] = [primaryDraft];

  // Se o pedido fizer parte de um carrinho (pack_id), busca irmãos para manter rateio de frete exato
  if (primaryDraft.ml_pack_id) {
    const packRes = await mlReadOnlyGet<{ orders?: Array<{ id?: number }> }>(
      `${ML_API_BASE}/packs/${primaryDraft.ml_pack_id}`,
      ctx.account,
      ctx.tokenRef
    );
    const siblingIds = (packRes.data?.orders ?? [])
      .map((o) => Number(o?.id))
      .filter((id) => Number.isSafeInteger(id) && id > 0 && id !== params.orderId)
      .slice(0, MAX_PACK_SIBLINGS);

    if (siblingIds.length > 0) {
      const siblingDrafts = await Promise.all(
        siblingIds.map((id) =>
          extractSingleOrder(id, ctx.account, ctx.tokenRef, shipmentCache)
        )
      );
      for (const sd of siblingDrafts) {
        if (sd) drafts.push(sd);
      }
    }
  }

  applyPackShippingProration(drafts);

  const distinctMlbs = Array.from(new Set(drafts.map((d) => d.mlb_id)));

  const [thumbMap, listingsUpdated] = await Promise.all([
    fetchItemThumbnailsMap(distinctMlbs, ctx.account, ctx.tokenRef),
    syncListingsStockInCatalog({
      mlbIds: distinctMlbs,
      account: ctx.account,
      tokenRef: ctx.tokenRef,
    }),
  ]);

  for (const d of drafts) {
    const meta = thumbMap.get(d.mlb_id);
    if (meta) {
      d.product_thumbnail = meta.thumbnail;
      d.permalink = meta.permalink;
    }
  }

  const ordersUpserted = await upsertDraftsPreservingManualFields({
    scope: ctx.scope,
    drafts,
  });

  return {
    synced: true,
    ordersUpserted,
    listingsUpdated,
  };
}

/**
 * Sincroniza mudança de status logístico (`shipped`, `delivered`, `returned`) a partir de um `shipment_id`.
 */
export async function syncMercadoLivreOrderByShipment(params: {
  sellerId: string;
  shipmentId: number;
}): Promise<WebhookSyncOutcome> {
  const admin = createSupabaseAdminClient();
  const { data: existingOrder } = await admin
    .from("ml_sales_orders")
    .select("ml_order_id")
    .eq("ml_shipment_id", params.shipmentId)
    .eq("ml_seller_id", params.sellerId)
    .limit(1)
    .maybeSingle();

  if (existingOrder?.ml_order_id) {
    return syncMercadoLivreSingleOrderBySeller({
      sellerId: params.sellerId,
      orderId: Number(existingOrder.ml_order_id),
    });
  }

  const ctx = await resolveActiveMlSellerContext(params.sellerId);
  if (!ctx) {
    return {
      synced: false,
      reason: "seller_not_connected",
      ordersUpserted: 0,
      listingsUpdated: 0,
    };
  }

  const shipRes = await mlReadOnlyGet<RawShipmentDetail>(
    `${ML_API_BASE}/shipments/${params.shipmentId}`,
    ctx.account,
    ctx.tokenRef,
    { "x-format-new": "true" }
  );

  const orderId = Number(shipRes.data?.order_id ?? 0);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return {
      synced: false,
      reason: "shipment_without_order",
      ordersUpserted: 0,
      listingsUpdated: 0,
    };
  }

  return syncMercadoLivreSingleOrderBySeller({
    sellerId: params.sellerId,
    orderId,
  });
}

/**
 * Sincroniza estoque e quantidade vendida de um item específico em `my_listings` via tópico `items`.
 */
export async function syncMercadoLivreItemBySeller(params: {
  sellerId: string;
  mlbId: string;
}): Promise<WebhookSyncOutcome> {
  const ctx = await resolveActiveMlSellerContext(params.sellerId);
  if (!ctx) {
    return {
      synced: false,
      reason: "seller_not_connected",
      ordersUpserted: 0,
      listingsUpdated: 0,
    };
  }

  const listingsUpdated = await syncListingsStockInCatalog({
    mlbIds: [params.mlbId],
    account: ctx.account,
    tokenRef: ctx.tokenRef,
  });

  return {
    synced: true,
    ordersUpserted: 0,
    listingsUpdated,
  };
}
