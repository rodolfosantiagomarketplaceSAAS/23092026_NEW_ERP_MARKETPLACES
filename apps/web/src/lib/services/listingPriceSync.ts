import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getActiveMarketplaceToken } from "@/lib/services/marketplaceIntegrations";

export interface SyncPriceResult {
  success: boolean;
  myListingId: string;
  current_price?: number;
  original_price?: number | null;
  error?: string;
}

/**
 * Atualiza o preço atual e o preço promocional de um anúncio próprio no banco de dados,
 * consultando diretamente as APIs oficiais do Mercado Livre (/sale_price e /seller-promotions).
 */
export async function syncSingleMyListingPrice(myListingId: string): Promise<SyncPriceResult> {
  const supabase = createSupabaseAdminClient();

  try {
    // 1. Busca dados do anúncio próprio
    const { data: listing, error: listingErr } = await supabase
      .from("my_listings")
      .select("id, user_id, organization_id, platform, external_id, current_price, original_price")
      .eq("id", myListingId)
      .maybeSingle();

    if (listingErr || !listing) {
      return { success: false, myListingId, error: "Anúncio próprio não encontrado." };
    }

    if (listing.platform !== "mercadolivre") {
      // Shopee ou outras plataformas futuras
      return {
        success: true,
        myListingId,
        current_price: listing.current_price,
        original_price: listing.original_price,
      };
    }

    // 2. Busca token do Mercado Livre (se disponível)
    let accessToken: string | null = null;
    try {
      const scope = {
        userId: listing.user_id,
        organizationId: listing.organization_id || null,
      };
      accessToken = await getActiveMarketplaceToken("mercadolivre", scope);
    } catch {
      accessToken = null;
    }

    const cleanId = (listing.external_id || "").replace(/[^a-zA-Z0-9]/g, "").trim();
    if (!cleanId) {
      return { success: false, myListingId, error: "external_id ausente." };
    }

    // 3. Consulta em paralelo: dados base do anúncio (público ou autenticado), /sale_price e promoções
    const headers: Record<string, string> = {
      "User-Agent": "CRM-Marketplaces-ERP/2.0",
      Accept: "application/json",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const [itemRes, salePriceRes, promoRes] = await Promise.all([
      fetch(`https://api.mercadolibre.com/items/${cleanId}`, {
        headers,
        cache: "no-store",
      }).catch(() => null),
      accessToken
        ? fetch(`https://api.mercadolibre.com/items/${cleanId}/sale_price`, {
            headers,
            cache: "no-store",
          }).catch(() => null)
        : Promise.resolve(null),
      accessToken
        ? fetch(`https://api.mercadolibre.com/seller-promotions/items/${cleanId}?app_version=v2`, {
            headers,
            cache: "no-store",
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const itemData = itemRes && itemRes.ok ? await itemRes.json() : null;
    const salePriceData = salePriceRes && salePriceRes.ok ? await salePriceRes.json() : null;
    const promoData = promoRes && promoRes.ok ? await promoRes.json() : null;

    let basePrice = Number(itemData?.price || listing.current_price || 0);
    let resolvedCurrentPrice = basePrice;
    let resolvedOriginalPrice: number | null = null;

    // Prioridade 1: /sale_price
    if (salePriceData?.amount && Number(salePriceData.amount) > 0) {
      resolvedCurrentPrice = Number(salePriceData.amount);
      if (salePriceData.regular_amount && Number(salePriceData.regular_amount) > resolvedCurrentPrice) {
        resolvedOriginalPrice = Number(salePriceData.regular_amount);
      } else if (basePrice > resolvedCurrentPrice) {
        resolvedOriginalPrice = basePrice;
      }
    } else if (Array.isArray(promoData) && promoData.length > 0) {
      // Prioridade 2: seller-promotions ativa (status = 'started' ou 'active')
      const activePromo = promoData.find(
        (p: any) => (p.status === "started" || p.status === "active") && Number(p.price) > 0
      );
      if (activePromo) {
        resolvedCurrentPrice = Number(activePromo.price);
        resolvedOriginalPrice =
          Number(activePromo.original_price) > resolvedCurrentPrice
            ? Number(activePromo.original_price)
            : basePrice > resolvedCurrentPrice
            ? basePrice
            : null;
      }
    }

    // Fallback: original_price ou base_price do item
    if (!resolvedOriginalPrice) {
      if (itemData?.original_price && Number(itemData.original_price) > resolvedCurrentPrice) {
        resolvedOriginalPrice = Number(itemData.original_price);
      } else if (itemData?.base_price && Number(itemData.base_price) > resolvedCurrentPrice) {
        resolvedOriginalPrice = Number(itemData.base_price);
      }
    }

    // 4. Salva no banco my_listings
    await supabase
      .from("my_listings")
      .update({
        current_price: resolvedCurrentPrice,
        original_price: resolvedOriginalPrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", myListingId);

    return {
      success: true,
      myListingId,
      current_price: resolvedCurrentPrice,
      original_price: resolvedOriginalPrice,
    };
  } catch (err: any) {
    console.error(`[syncSingleMyListingPrice] Falha ao atualizar ${myListingId}:`, err);
    return { success: false, myListingId, error: err.message || "Erro desconhecido" };
  }
}
