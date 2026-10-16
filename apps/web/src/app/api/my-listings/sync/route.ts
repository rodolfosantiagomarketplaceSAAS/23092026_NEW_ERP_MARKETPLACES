import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { getActiveMarketplaceToken, getMarketplaceIntegrations } from "@/lib/services/marketplaceIntegrations";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincronização oficial de anúncios do Mercado Livre (Modo Somente Leitura).
 * Puxa os anúncios do vendedor conectado via API do Mercado Livre e atualiza a tabela my_listings.
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

    // 2. Obter token de acesso válido (renova automaticamente se necessário)
    const accessToken = await getActiveMarketplaceToken("mercadolivre", scope, mlAccount.seller_id);
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Falha ao obter token de acesso do Mercado Livre. Tente reconectar a conta em Configurações.",
        },
        { status: 400 }
      );
    }

    // 3. Buscar os IDs dos anúncios do vendedor via API oficial do Mercado Livre
    // GET https://api.mercadolibre.com/users/{seller_id}/items/search
    const searchUrl = `https://api.mercadolibre.com/users/${mlAccount.seller_id}/items/search?status=active&limit=50`;
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

        // Tentar obter SKU dos atributos
        const skuAttr = item.attributes?.find(
          (a: any) => a.id === "SELLER_SKU" || a.id === "SKU"
        );
        const itemSku = skuAttr?.value_name || item.seller_custom_field || null;

        let productId: string | null = null;

        // Se houver SKU, criar ou vincular produto no catálogo de produtos
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
        const { error: upsertError } = await supabase
          .from("my_listings")
          .upsert(
            {
              user_id: ctx.userId,
              product_id: productId,
              platform: "mercadolivre",
              external_id: item.id,
              title: item.title,
              current_price: item.price || 0,
              permalink: item.permalink || `https://produto.mercadolivre.com.br/${item.id}`,
              thumbnail_url: item.thumbnail || item.pictures?.[0]?.secure_url || null,
              shipping_type: shippingType,
              listing_type: item.listing_type_id || "gold_special",
              status: item.status === "active" ? "active" : item.status === "paused" ? "paused" : "closed",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform,external_id" }
          );

        if (!upsertError) {
          syncedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${syncedCount} anúncios do Mercado Livre importados e sincronizados com sucesso!`,
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
