import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getActiveMarketplaceToken, markReauthRequired } from "@/lib/services/marketplaceIntegrations";

export interface SyncPriceResult {
  success: boolean;
  myListingId: string;
  current_price?: number;
  original_price?: number | null;
  error?: string;
  reauthRequired?: boolean;
}

/**
 * Atualiza o preço atual e o preço promocional de um anúncio próprio no banco de dados,
 * consultando diretamente as APIs oficiais do Mercado Livre (/seller-promotions e /prices).
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
      return {
        success: true,
        myListingId,
        current_price: listing.current_price,
        original_price: listing.original_price,
      };
    }

    // 2. Busca token do Mercado Livre
    let accessToken: string | null = null;
    const scope = {
      userId: listing.user_id,
      organizationId: listing.organization_id || null,
    };
    try {
      accessToken = await getActiveMarketplaceToken("mercadolivre", scope);
    } catch {
      accessToken = null;
    }

    if (!accessToken) {
      return {
        success: false,
        myListingId,
        reauthRequired: true,
        error: "Autorização do Mercado Livre ausente ou expirada. Reconecte a conta em Configurações & APIs.",
      };
    }

    const cleanId = (listing.external_id || "").replace(/[^a-zA-Z0-9]/g, "").trim();
    if (!cleanId) {
      return { success: false, myListingId, error: "external_id ausente." };
    }

    // 3. Consulta em paralelo: dados base do anúncio, promoções ativas e lista de preços (/prices)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "CRM-Marketplaces-ERP/2.0",
      Accept: "application/json",
    };

    const [itemRes, promoRes, pricesRes] = await Promise.all([
      fetch(`https://api.mercadolibre.com/items/${cleanId}`, {
        headers,
        cache: "no-store",
      }).catch(() => null),
      fetch(`https://api.mercadolibre.com/seller-promotions/items/${cleanId}?app_version=v2`, {
        headers,
        cache: "no-store",
      }).catch(() => null),
      fetch(`https://api.mercadolibre.com/items/${cleanId}/prices`, {
        headers,
        cache: "no-store",
      }).catch(() => null),
    ]);

    // Detecção de token expirado ou revogado pelo ML
    if (
      (itemRes && (itemRes.status === 401 || itemRes.status === 403)) ||
      (promoRes && (promoRes.status === 401 || promoRes.status === 403))
    ) {
      // Localiza a integração correspondente para marcar reauth_required
      const { data: intRow } = await supabase
        .from("marketplace_integrations")
        .select("id")
        .eq("platform", "mercadolivre")
        .eq("user_id", listing.user_id)
        .maybeSingle();

      if (intRow?.id) {
        await markReauthRequired(
          intRow.id,
          "Autorização expirada ou revogada pelo Mercado Livre (403/401). Reconecte a conta."
        );
      }

      return {
        success: false,
        myListingId,
        reauthRequired: true,
        error: "Autorização da conta do Mercado Livre expirou. Reconecte em Configurações & APIs.",
      };
    }

    const itemData = itemRes && itemRes.ok ? await itemRes.json() : null;
    const promoData = promoRes && promoRes.ok ? await promoRes.json() : null;
    const pricesData = pricesRes && pricesRes.ok ? await pricesRes.json() : null;

    let basePrice = Number(itemData?.price || listing.current_price || 0);
    let resolvedCurrentPrice = basePrice;
    let resolvedOriginalPrice: number | null = null;

    // Prioridade 1: /seller-promotions/items/{cleanId}?app_version=v2
    if (promoData) {
      const promoList = Array.isArray(promoData) ? promoData : promoData.results || [];
      const activePromo = promoList.find(
        (p: any) =>
          (p.status === "started" || p.status === "active" || p.status === "pending" || p.status === "sync_requested") &&
          Number(p.price ?? p.deal_price ?? p.top_deal_price ?? 0) > 0
      );

      if (activePromo) {
        resolvedCurrentPrice = Number(activePromo.price ?? activePromo.deal_price ?? activePromo.top_deal_price);
        const promoOrig = Number(activePromo.original_price || basePrice || 0);
        if (promoOrig > resolvedCurrentPrice) {
          resolvedOriginalPrice = promoOrig;
        }
      }
    }

    // Prioridade 2: /items/{cleanId}/prices (caso a API retorne objeto estruturado de preços)
    if (resolvedCurrentPrice === basePrice && pricesData && Array.isArray(pricesData.prices)) {
      const promoEntry = pricesData.prices.find((p: any) => p.type === "promotion" && Number(p.amount) > 0);
      const standardEntry = pricesData.prices.find((p: any) => p.type === "standard" && Number(p.amount) > 0);
      if (promoEntry) {
        resolvedCurrentPrice = Number(promoEntry.amount);
        if (standardEntry && Number(standardEntry.amount) > resolvedCurrentPrice) {
          resolvedOriginalPrice = Number(standardEntry.amount);
        }
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
