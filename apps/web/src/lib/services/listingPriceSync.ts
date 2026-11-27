import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getActiveMarketplaceToken,
  markReauthRequired,
  type IntegrationScope,
} from "@/lib/services/marketplaceIntegrations";
import { sanitizePostgrestFilterValue } from "@/lib/security/url-validator";

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
 * validando isolamento por tenant (`expectedScope`) e usando exclusivamente o token OAuth do lojista dono.
 */
export async function syncSingleMyListingPrice(
  myListingId: string,
  expectedScope?: IntegrationScope
): Promise<SyncPriceResult> {
  const supabase = createSupabaseAdminClient();

  try {
    const safeInput = sanitizePostgrestFilterValue(myListingId, 80);
    if (!safeInput) {
      return { success: false, myListingId, error: "Identificador de anúncio inválido." };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      safeInput
    );

    let query = supabase
      .from("my_listings")
      .select("id, user_id, platform, external_id, current_price, original_price");

    if (expectedScope?.userId) {
      query = query.eq("user_id", expectedScope.userId);
    }

    query = isUuid
      ? query.eq("id", safeInput)
      : query.eq("external_id", safeInput.toUpperCase());

    const { data: listing, error: listingErr } = await query.maybeSingle();

    if (listingErr || !listing) {
      return { success: false, myListingId, error: "Anúncio próprio não encontrado no seu catálogo." };
    }

    if (listing.platform !== "mercadolivre") {
      return {
        success: true,
        myListingId: listing.id,
        current_price: listing.current_price,
        original_price: listing.original_price,
      };
    }

    // Resolve o organization_id do dono do anúncio se não veio no expectedScope
    let ownerOrgId = expectedScope?.organizationId ?? null;
    if (!ownerOrgId && listing.user_id) {
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", listing.user_id)
        .maybeSingle();
      ownerOrgId = prof?.organization_id ?? null;
    }

    // SEGURANÇA MULTI-TENANT: Busca token OAuth EXCLUSIVAMENTE da loja/usuário dono do anúncio
    let accessToken: string | null = null;
    if (listing.user_id) {
      accessToken = await getActiveMarketplaceToken("mercadolivre", {
        userId: listing.user_id,
        organizationId: ownerOrgId,
      }).catch(() => null);
    }

    if (!accessToken) {
      return {
        success: false,
        myListingId: listing.id,
        reauthRequired: true,
        error: "Autorização do Mercado Livre ausente ou expirada. Reconecte a conta em Configurações & APIs.",
      };
    }

    const cleanId = (listing.external_id || "").replace(/[^a-zA-Z0-9]/g, "").trim();
    if (!cleanId) {
      return { success: false, myListingId: listing.id, error: "external_id ausente." };
    }

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

    const isTokenRevoked =
      itemRes &&
      (itemRes.status === 401 ||
        (itemRes.status === 403 &&
          (itemData?.code === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES" ||
            itemData?.blocked_by === "PolicyAgent")));

    if (isTokenRevoked) {
      let intQuery = supabase
        .from("marketplace_integrations")
        .select("id")
        .eq("platform", "mercadolivre");

      intQuery = ownerOrgId
        ? intQuery.eq("organization_id", ownerOrgId)
        : intQuery.eq("user_id", listing.user_id);

      const { data: intRow } = await intQuery.limit(1).maybeSingle();
      if (intRow?.id) {
        await markReauthRequired(
          intRow.id,
          "Autorização expirada ou revogada pelo Mercado Livre (403/401). Reconecte a conta."
        );
      }

      return {
        success: false,
        myListingId: listing.id,
        reauthRequired: true,
        error: "Autorização da conta do Mercado Livre expirou. Reconecte em Configurações & APIs.",
      };
    }

    const basePrice = Number(itemData?.price || listing.current_price || 0);
    let resolvedCurrentPrice = basePrice;
    let resolvedOriginalPrice: number | null = null;

    if (promoData) {
      const promoList = (Array.isArray(promoData) ? promoData : promoData.results || []) as Array<
        Record<string, unknown>
      >;
      const activePromos = promoList.filter(
        (p) =>
          (p.status === "started" ||
            p.status === "active" ||
            p.status === "pending" ||
            p.status === "sync_requested") &&
          Number(p.price ?? p.deal_price ?? p.top_deal_price ?? 0) > 0
      );

      if (activePromos.length > 0) {
        activePromos.sort((a, b) => {
          const priceA = Number(a.price ?? a.deal_price ?? a.top_deal_price);
          const priceB = Number(b.price ?? b.deal_price ?? b.top_deal_price);
          return priceA - priceB;
        });

        const bestPromo = activePromos[0];
        resolvedCurrentPrice = Number(
          bestPromo.price ?? bestPromo.deal_price ?? bestPromo.top_deal_price
        );

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

    if (resolvedCurrentPrice === basePrice && pricesData && Array.isArray(pricesData.prices)) {
      const promoEntry = pricesData.prices.find(
        (p: Record<string, unknown>) => p.type === "promotion" && Number(p.amount) > 0
      );
      const standardEntry = pricesData.prices.find(
        (p: Record<string, unknown>) => p.type === "standard" && Number(p.amount) > 0
      );
      if (promoEntry) {
        resolvedCurrentPrice = Number(promoEntry.amount);
        if (standardEntry && Number(standardEntry.amount) > resolvedCurrentPrice) {
          resolvedOriginalPrice = Number(standardEntry.amount);
        }
      }
    }

    if (!resolvedOriginalPrice) {
      if (itemData?.original_price && Number(itemData.original_price) > resolvedCurrentPrice) {
        resolvedOriginalPrice = Number(itemData.original_price);
      } else if (itemData?.base_price && Number(itemData.base_price) > resolvedCurrentPrice) {
        resolvedOriginalPrice = Number(itemData.base_price);
      }
    }

    await supabase
      .from("my_listings")
      .update({
        current_price: resolvedCurrentPrice,
        original_price: resolvedOriginalPrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listing.id)
      .eq("user_id", listing.user_id);

    return {
      success: true,
      myListingId: listing.id,
      current_price: resolvedCurrentPrice,
      original_price: resolvedOriginalPrice,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error(`[syncSingleMyListingPrice] Falha ao atualizar ${myListingId}:`, message);
    return { success: false, myListingId, error: message };
  }
}
