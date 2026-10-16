import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { getActiveMarketplaceToken, getMarketplaceIntegrations } from "@/lib/services/marketplaceIntegrations";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincronização avançada de anúncios do Mercado Livre (Padrão ERP Especialista).
 * Puxa:
 * - Preço de venda atual (promocional) + Preço normal de tabela (original_price)
 * - Total de vendas confirmadas (sold_quantity)
 * - Variações de produto (combinações de cor, acabamento, tamanho, preço por variação)
 * - Modalidade de anúncio (Clássico / Premium)
 * - Estoque disponível e fotos
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }

    const scope = { userId: ctx.userId, organizationId: ctx.organizationId };

    // 1. Obter integrações do Mercado Livre ativas
    const integrations = await getMarketplaceIntegrations(scope);
    const mlAccount = integrations.find((i) => i.platform === "mercadolivre" && i.status === "online");

    if (!mlAccount) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhuma conta do Mercado Livre conectada ou autorização pendente. Conecte sua conta em Configurações.",
        },
        { status: 400 }
      );
    }

    // 2. Obter token de acesso válido
    const accessToken = await getActiveMarketplaceToken("mercadolivre", scope, mlAccount.seller_id);
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Falha ao obter token de acesso do Mercado Livre. Reconecte a conta em Configurações.",
        },
        { status: 400 }
      );
    }

    // 3. Buscar até 100 anúncios ativos do vendedor
    const searchUrl = `https://api.mercadolibre.com/users/${mlAccount.seller_id}/items/search?status=active&limit=100`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("[ML Sync Items] Erro ao buscar lista de IDs:", errText);
      return NextResponse.json(
        { success: false, error: "Erro ao consultar lista de anúncios no Mercado Livre." },
        { status: 400 }
      );
    }

    const searchData = await searchRes.json();
    const itemIds: string[] = searchData.results || [];

    if (itemIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhum anúncio ativo encontrado na sua conta do Mercado Livre.",
        syncedCount: 0,
      });
    }

    // 4. Buscar detalhes dos anúncios em lote (Multiget: até 20 itens por requisição)
    const chunks: string[][] = [];
    for (let i = 0; i < itemIds.length; i += 20) {
      chunks.push(itemIds.slice(i, i + 20));
    }

    const supabase = createSupabaseAdminClient();
    let syncedCount = 0;

    for (const chunk of chunks) {
      const itemsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}`;
      const itemsRes = await fetch(itemsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!itemsRes.ok) continue;

      const itemsData = await itemsRes.json();

      for (const itemWrapper of itemsData) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) continue;
        const item = itemWrapper.body;

        // Detectar tipo de logística ML
        let shippingType = "padrao";
        if (item.shipping?.logistic_type === "fulfillment") {
          shippingType = "ml_full";
        } else if (item.shipping?.logistic_type === "self_service") {
          shippingType = "ml_flex";
        } else if (item.shipping?.logistic_type === "cross_docking") {
          shippingType = "ml_coleta";
        }

        // Tentar obter SKU principal do anúncio
        const skuAttr = item.attributes?.find(
          (a: any) => a.id === "SELLER_SKU" || a.id === "SKU"
        );
        const itemSku = skuAttr?.value_name || item.seller_custom_field || null;

        // Formatar variações completas (Ex: Cor, Acabamento, Estoque, SKU próprio de cada variação)
        const parsedVariations = Array.isArray(item.variations)
          ? item.variations.map((v: any) => {
              const varSkuAttr = v.attributes?.find(
                (a: any) => a.id === "SELLER_SKU" || a.id === "SKU"
              );
              const comboName = Array.isArray(v.attribute_combinations)
                ? v.attribute_combinations.map((c: any) => `${c.name}: ${c.value_name}`).join(" | ")
                : "Variação";

              return {
                id: v.id,
                name: comboName,
                price: Number(v.price || item.price || 0),
                original_price: v.original_price ? Number(v.original_price) : null,
                sku: varSkuAttr?.value_name || v.seller_custom_field || null,
                available_quantity: v.available_quantity || 0,
                sold_quantity: v.sold_quantity || 0,
                picture_id: v.picture_ids?.[0] || null,
              };
            })
          : [];

        // Preço atual e preço de tabela (original_price)
        const currentPrice = Number(item.price || 0);
        const originalPrice = item.original_price ? Number(item.original_price) : null;
        const soldQty = Number(item.sold_quantity || 0);
        const availableQty = Number(item.available_quantity || 0);

        let productId: string | null = null;

        // Sincronizar produto no catálogo base caso haja SKU
        if (itemSku) {
          const { data: existingProd } = await supabase
            .from("products")
            .select("id")
            .eq("user_id", ctx.userId)
            .eq("sku", itemSku)
            .maybeSingle();

          if (existingProd) {
            productId = existingProd.id;
          } else {
            const { data: newProd } = await supabase
              .from("products")
              .insert({
                user_id: ctx.userId,
                sku: itemSku,
                title: item.title,
                cost_price: 0,
                min_selling_price: 0,
              })
              .select("id")
              .maybeSingle();

            if (newProd) productId = newProd.id;
          }
        }

        // Upsert na tabela my_listings
        const listingPayload: any = {
          user_id: ctx.userId,
          product_id: productId,
          platform: "mercadolivre",
          external_id: item.id,
          title: item.title,
          current_price: currentPrice,
          original_price: originalPrice,
          sold_quantity: soldQty,
          available_quantity: availableQty,
          permalink: item.permalink || `https://produto.mercadolivre.com.br/${item.id}`,
          thumbnail_url: item.thumbnail || item.pictures?.[0]?.secure_url || null,
          shipping_type: shippingType,
          listing_type: item.listing_type_id || "gold_special",
          status: item.status === "active" ? "active" : item.status === "paused" ? "paused" : "closed",
          variations: parsedVariations,
          updated_at: new Date().toISOString(),
        };

        let { error: upsertError } = await supabase
          .from("my_listings")
          .upsert(listingPayload, { onConflict: "user_id,platform,external_id" });

        // Fallback caso a migration das novas colunas ainda não tenha sido rodada no Supabase
        if (upsertError && (upsertError.message?.includes("sold_quantity") || upsertError.code === "42703")) {
          delete listingPayload.original_price;
          delete listingPayload.sold_quantity;
          delete listingPayload.available_quantity;
          delete listingPayload.variations;
          const retry = await supabase
            .from("my_listings")
            .upsert(listingPayload, { onConflict: "user_id,platform,external_id" });
          upsertError = retry.error;
        }

        if (!upsertError) {
          syncedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${syncedCount} anúncios do Mercado Livre sincronizados com dados de preços, vendas e variações!`,
      syncedCount,
      accountName: mlAccount.account_name,
    });
  } catch (err: any) {
    console.error("[ML Listings Sync Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Erro inesperado ao sincronizar anúncios." },
      { status: 500 }
    );
  }
}
