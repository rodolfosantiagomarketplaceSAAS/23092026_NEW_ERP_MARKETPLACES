import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import {
  getActiveMarketplaceToken,
  getMarketplaceIntegrations,
  markReauthRequired,
} from "@/lib/services/marketplaceIntegrations";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  extractItemSku,
  extractMercadoLivreCatalog,
  extractVariationName,
  normalizeItemStatus,
} from "@/lib/mercadolivre/catalog-sync";
import { isMissingTableError } from "@/lib/mercadolivre/tenant-scope";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincronização oficial do Catálogo Mercado Livre (Arquitetura User Products — 3 Níveis):
 * 1. Extrai todos os anúncios via multiget + sale_price + listing_prices + shipping_options/free + visits 7d + orders 7d/30d + health/actions.
 * 2. Persiste atomicamente via RPC `sync_ml_catalog_hierarchy` nas tabelas `ml_families`, `ml_variations` e `ml_sale_options`.
 * 3. Espelha dados atualizados em `my_listings` para manter 100% de compatibilidade com BI, Concorrentes, Webhooks e Extensão.
 */
export async function POST() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const scope = { userId: ctx.userId, organizationId: ctx.organizationId };

    const integrations = await getMarketplaceIntegrations(scope);
    const mlAccount = integrations.find(
      (i) => i.platform === "mercadolivre" && i.status === "online"
    );

    if (!mlAccount) {
      const anyMl = integrations.find((i) => i.platform === "mercadolivre");
      if (anyMl && anyMl.status === "reauth_required") {
        return NextResponse.json(
          {
            success: false,
            reauthRequired: true,
            error:
              "A autorização da sua conta do Mercado Livre expirou ou foi revogada. Acesse 'Configurações & APIs' e clique em 'Reconectar'.",
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error:
            "Nenhuma conta do Mercado Livre conectada ou autorização pendente. Conecte sua conta em Configurações.",
        },
        { status: 400 }
      );
    }

    const accessToken = await getActiveMarketplaceToken(
      "mercadolivre",
      scope,
      mlAccount.seller_id
    );
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          reauthRequired: true,
          error:
            "Falha ao obter token de acesso do Mercado Livre. Reconecte a conta em Configurações & APIs.",
        },
        { status: 401 }
      );
    }

    const sellerIdStr = String(mlAccount.seller_id);

    // 1. Pipeline ETL Oficial da API do Mercado Livre
    const { totalFound, authFailedStatus, enrichedItems, normalized } =
      await extractMercadoLivreCatalog(sellerIdStr, accessToken);

    if (authFailedStatus && totalFound === 0) {
      await markReauthRequired(
        mlAccount.id,
        `Autorização expirada ou revogada pelo Mercado Livre (HTTP ${authFailedStatus}). Reconecte a conta.`
      );
      return NextResponse.json(
        {
          success: false,
          reauthRequired: true,
          error:
            "A autorização da sua conta do Mercado Livre expirou ou foi revogada. Acesse 'Configurações & APIs' no menu lateral e clique em 'Reconectar'.",
        },
        { status: 401 }
      );
    }

    if (totalFound === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhum anúncio encontrado na sua conta do Mercado Livre.",
        syncedCount: 0,
        familiesCount: 0,
        variationsCount: 0,
        optionsCount: 0,
      });
    }

    const supabase = createSupabaseAdminClient();

    // 2. Upsert transacional atômico nas 3 tabelas normalizadas (`ml_families`, `ml_variations`, `ml_sale_options`)
    let migrationPending = false;
    let rpcResult: Record<string, unknown> | null = null;

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "sync_ml_catalog_hierarchy",
      {
        p_organization_id: ctx.organizationId ?? null,
        p_user_id: ctx.userId,
        p_seller_id: sellerIdStr,
        p_families: normalized.families,
        p_variations: normalized.variations,
        p_sale_options: normalized.saleOptions,
      }
    );

    if (rpcError) {
      const msg = (rpcError.message || "").toLowerCase();
      if (
        isMissingTableError(rpcError) ||
        rpcError.code === "PGRST202" ||
        msg.includes("sync_ml_catalog_hierarchy") ||
        msg.includes("could not find the function")
      ) {
        migrationPending = true;
        console.warn(
          "[my-listings/sync] RPC sync_ml_catalog_hierarchy ainda não aplicada no Supabase; espelhando apenas em my_listings."
        );
      } else {
        console.error("[my-listings/sync] Erro na RPC transacional:", rpcError);
        return NextResponse.json(
          {
            success: false,
            error: `Falha ao persistir hierarquia normalizada no banco: ${rpcError.message}`,
          },
          { status: 500 }
        );
      }
    } else {
      rpcResult = (rpcData as Record<string, unknown>) || null;
    }

    // 3. Espelhamento em lote em `products` (elimina loop N+1 de inserts sequenciais!) e `my_listings`
    const syncedExternalIds = new Set<string>();
    const skuToProductId = new Map<string, string>();
    const skuTitleMap = new Map<string, string>();

    for (const entry of enrichedItems) {
      const s = extractItemSku(entry.item);
      if (s && !skuTitleMap.has(s)) {
        skuTitleMap.set(s, entry.item.family_name || entry.item.title || s);
      }
    }

    const uniqueSkus = Array.from(skuTitleMap.keys());

    if (uniqueSkus.length > 0) {
      for (let i = 0; i < uniqueSkus.length; i += 300) {
        const chunk = uniqueSkus.slice(i, i + 300);
        const { data: existingProducts } = await supabase
          .from("products")
          .select("id, sku")
          .eq("user_id", ctx.userId)
          .in("sku", chunk);

        for (const prod of existingProducts || []) {
          if (prod.sku && prod.id) {
            skuToProductId.set(prod.sku, prod.id);
          }
        }
      }

      const missingSkus = uniqueSkus.filter((sku) => !skuToProductId.has(sku));
      for (let i = 0; i < missingSkus.length; i += 200) {
        const batchPayload = missingSkus.slice(i, i + 200).map((sku) => ({
          user_id: ctx.userId,
          sku,
          title: skuTitleMap.get(sku) || sku,
          cost_price: 0,
          min_selling_price: 0,
        }));

        const { data: createdProds } = await supabase
          .from("products")
          .upsert(batchPayload, { onConflict: "user_id,sku" })
          .select("id, sku");

        for (const prod of createdProds || []) {
          if (prod.sku && prod.id) {
            skuToProductId.set(prod.sku, prod.id);
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    const mirrorRows: Record<string, unknown>[] = [];

    for (const entry of enrichedItems) {
      const { item } = entry;
      syncedExternalIds.add(item.id);

      const itemSku = extractItemSku(item);
      const productId = itemSku ? skuToProductId.get(itemSku) ?? null : null;

      const primaryThumbnail =
        item.pictures?.[0]?.secure_url ||
        item.pictures?.[0]?.url ||
        item.thumbnail ||
        null;

      const familyId =
        item.family_id !== null && item.family_id !== undefined
          ? String(item.family_id).trim() || null
          : null;
      const userProductId =
        item.user_product_id?.trim() ||
        item.variations?.[0]?.user_product_id?.trim() ||
        null;
      const subStatus =
        Array.isArray(item.sub_status) && item.sub_status.length > 0
          ? String(item.sub_status[0])
          : null;
      const normalizedStatus = normalizeItemStatus(item.status);
      const legacyStatus =
        normalizedStatus === "active"
          ? "active"
          : normalizedStatus === "paused" || normalizedStatus === "under_review"
          ? "paused"
          : "closed";

      mirrorRows.push({
        user_id: ctx.userId,
        product_id: productId,
        platform: "mercadolivre",
        external_id: item.id,
        title: item.title,
        current_price: entry.activePrice,
        original_price: entry.promoPrice !== null ? entry.basePrice : null,
        sold_quantity: Math.max(0, Number(item.sold_quantity || 0)),
        available_quantity: Math.max(0, Number(item.available_quantity || 0)),
        visits: entry.visits7d,
        sales_last_7_days: entry.sales7d,
        sales_last_30_days: entry.sales30d,
        permalink:
          item.permalink ||
          `https://produto.mercadolivre.com.br/${item.id.replace(/^MLB(\d+)/i, "MLB-$1")}`,
        thumbnail_url: primaryThumbnail,
        shipping_type: entry.shippingLogisticType,
        listing_type: item.listing_type_id || "gold_special",
        status: legacyStatus,
        family_id: familyId,
        family_name: item.family_name || null,
        user_product_id: userProductId,
        parent_item_id: item.parent_item_id ? String(item.parent_item_id) : null,
        catalog_product_id: item.catalog_product_id ? String(item.catalog_product_id) : null,
        is_catalog: Boolean(item.catalog_listing),
        sale_fee_amount: entry.saleFeeAmount,
        sale_fee_pct: entry.saleFeePct,
        shipping_cost: entry.shippingCostAmount,
        free_shipping: entry.freeShipping,
        net_amount: entry.netReceiveAmount,
        quality_score: entry.healthScore,
        sub_status: subStatus,
        raw_data: {
          family_id: familyId,
          family_name: item.family_name || null,
          user_product_id: userProductId,
          variation_label: extractVariationName(item),
          sku: itemSku,
          is_catalog: Boolean(item.catalog_listing),
          has_wholesale: entry.hasWholesale,
          sale_fee_amount: entry.saleFeeAmount,
          sale_fee_pct: entry.saleFeePct,
          shipping_cost: entry.shippingCostAmount,
          shipping_mode_label: entry.shippingModeLabel,
          free_shipping: entry.freeShipping,
          net_amount: entry.netReceiveAmount,
          quality_score: entry.healthScore,
          pending_goals_count: entry.pendingGoalsCount,
          recommendation_title: entry.recommendationTitle,
          recommendation_action: entry.recommendationAction,
          sub_status: subStatus,
          category_id: item.category_id || null,
        },
        updated_at: nowIso,
      });
    }

    // Batch upsert em lotes de 100 em `my_listings`
    for (let i = 0; i < mirrorRows.length; i += 100) {
      const batch = mirrorRows.slice(i, i + 100);
      const { error: mirrorErr } = await supabase
        .from("my_listings")
        .upsert(batch, { onConflict: "user_id,platform,external_id" });

      if (mirrorErr) {
        console.warn("[my-listings/sync] Aviso ao espelhar lote em my_listings:", mirrorErr.message);
      }
    }

    // Inativar itens obsoletos no espelho `my_listings`
    if (syncedExternalIds.size > 0) {
      const { data: existingMirror } = await supabase
        .from("my_listings")
        .select("id, external_id")
        .eq("user_id", ctx.userId)
        .eq("platform", "mercadolivre")
        .neq("status", "closed");

      const obsoleteIds = (existingMirror || [])
        .filter((row) => row.external_id && !syncedExternalIds.has(row.external_id))
        .map((row) => row.id);

      if (obsoleteIds.length > 0) {
        await supabase
          .from("my_listings")
          .update({ status: "closed", updated_at: nowIso })
          .in("id", obsoleteIds);
      }
    }

    const familiesCount = normalized.families.length;
    const variationsCount = normalized.variations.length;
    const optionsCount = normalized.saleOptions.length;

    return NextResponse.json({
      success: true,
      message: migrationPending
        ? `${optionsCount} opções MLB sincronizadas (rode a migration SQL 20261125170000 no Supabase para ativar as 3 tabelas normalizadas).`
        : `${familiesCount} famílias, ${variationsCount} variações e ${optionsCount} opções MLB sincronizadas com tarifas, frete e métricas reais do Mercado Livre!`,
      syncedCount: optionsCount,
      totalFound,
      familiesCount,
      variationsCount,
      optionsCount,
      migrationPending,
      rpcSummary: rpcResult,
      accountName: mlAccount.account_name,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro inesperado ao sincronizar anúncios.";
    console.error("[ML Listings Sync Error]:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
