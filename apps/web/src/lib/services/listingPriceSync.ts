import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getActiveMarketplaceToken, markReauthRequired } from "@/lib/services/marketplaceIntegrations";
import { decryptSecret } from "@/lib/security/crypto";

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
    // 1. Busca dados do anúncio próprio (por UUID ou external_id)
    let query = supabase
      .from("my_listings")
      .select("id, user_id, platform, external_id, current_price, original_price");

    if (myListingId.includes("-") && myListingId.length === 36) {
      query = query.eq("id", myListingId);
    } else {
      query = query.or(`id.eq.${myListingId},external_id.eq.${myListingId}`);
    }

    const { data: listing, error: listingErr } = await query.maybeSingle();

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
    try {
      // 2.1 Tenta obter via contexto autenticado da sessão atual
      accessToken = await getActiveMarketplaceToken("mercadolivre");
    } catch {
      accessToken = null;
    }

    if (!accessToken && listing.user_id) {
      try {
        accessToken = await getActiveMarketplaceToken("mercadolivre", {
          userId: listing.user_id,
          organizationId: null,
        });
      } catch {
        accessToken = null;
      }
    }

    // 2.2 Fallback de contingência: consulta diretamente a integração ativa mais recente no banco
    if (!accessToken) {
      let intQuery = supabase
        .from("marketplace_integrations")
        .select("access_token")
        .eq("platform", "mercadolivre")
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (listing.user_id) {
        intQuery = intQuery.eq("user_id", listing.user_id);
      }

      const { data: intRow } = await intQuery.limit(1).maybeSingle();
      if (intRow?.access_token) {
        try {
          accessToken = decryptSecret(intRow.access_token);
        } catch {}
      }
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

    const itemData = itemRes ? await itemRes.json().catch(() => null) : null;
    const promoData = promoRes && promoRes.ok ? await promoRes.json().catch(() => null) : null;
    const pricesData = pricesRes && pricesRes.ok ? await pricesRes.json().catch(() => null) : null;

    // Detecção de token expirado ou revogado pelo ML
    // IMPORTANTE: Só consideramos inválido se a chamada do item falhar com 401 ou 403 PolicyAgent.
    // Se o item retornou 200, o token está 100% válido.
    const isTokenRevoked =
      itemRes &&
      (itemRes.status === 401 ||
        (itemRes.status === 403 &&
          (itemData?.code === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES" || itemData?.blocked_by === "PolicyAgent")));

    if (isTokenRevoked) {
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

    let basePrice = Number(itemData?.price || listing.current_price || 0);
    let resolvedCurrentPrice = basePrice;
    let resolvedOriginalPrice: number | null = null;

    // Prioridade 1: /seller-promotions/items/{cleanId}?app_version=v2
    if (promoData) {
      const promoList = (Array.isArray(promoData) ? promoData : promoData.results || []) as any[];
      const activePromos = promoList.filter(
        (p: any) =>
          (p.status === "started" || p.status === "active" || p.status === "pending" || p.status === "sync_requested") &&
          Number(p.price ?? p.deal_price ?? p.top_deal_price ?? 0) > 0
      );

      if (activePromos.length > 0) {
        // Se houver múltiplas promoções simultâneas (ex: Smart Deal de 119.92 + Desconto Individual de 140.71),
        // o Mercado Livre sempre aplica o menor preço de venda vigente para o comprador.
        activePromos.sort((a, b) => {
          const priceA = Number(a.price ?? a.deal_price ?? a.top_deal_price);
          const priceB = Number(b.price ?? b.deal_price ?? b.top_deal_price);
          return priceA - priceB;
        });

        const bestPromo = activePromos[0];
        resolvedCurrentPrice = Number(bestPromo.price ?? bestPromo.deal_price ?? bestPromo.top_deal_price);

        const origCandidates = activePromos
          .map((p) => Number(p.original_price || 0))
          .filter((op) => op > resolvedCurrentPrice);

        if (origCandidates.length > 0) {
          resolvedOriginalPrice = Math.max(...origCandidates);
        } else if (basePrice > resolvedCurrentPrice) {
          resolvedOriginalPrice = basePrice;
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
