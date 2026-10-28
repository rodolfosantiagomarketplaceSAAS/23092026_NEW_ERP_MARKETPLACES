import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";
import { resolveRequestUser } from "@/lib/extension/auth";
import { getAuthContext } from "@/lib/auth/context";
import {
  MOCK_COMPARATIVE_DATA,
  recalculateGroupStatus,
} from "@/lib/data/comparativeStore";
import {
  cleanPromoBadge,
  cleanSellerName,
  estimateMlCreationDate,
  extractMlbId,
  extractMlbuId,
  fetchCompetitorViaMlApi,
  normalizeCompetitorPermalink,
  parsePrice,
  refineMlCreationDateFromImage,
  resolveAnyActiveMlToken,
  scrapeCompetitorFromUrl,
  type VerifiedCompetitorData,
} from "@/lib/services/competitorScraper";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. Resolve autenticação via Bearer token (Extensão) ou Cookie de Sessão (Web App Vercel)
    const authUser = await resolveRequestUser(req);
    const webCtx = !authUser ? await getAuthContext().catch(() => null) : null;
    let userId: string | null = authUser?.id ?? webCtx?.userId ?? null;
    let organizationId: string | null = webCtx?.organizationId ?? null;

    const body = await req.json().catch(() => ({}));
    const {
      my_listing_id,
      competitor_id,
      competitor_permalink,
      competitor_external_id,
      platform = "mercadolivre",
      verified_data,
    } = body;

    if (!my_listing_id) {
      return NextResponse.json(
        { error: "my_listing_id é obrigatório." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 2. Busca o anúncio próprio e o concorrente existente no Supabase (independente de cookie/header)
    const isMyListingRadar = String(my_listing_id).startsWith("radar-");

    const [myListingQuery, compByIdQuery] = await Promise.all([
      !isMyListingRadar
        ? supabase
            .from("my_listings")
            .select("*")
            .eq("id", my_listing_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      competitor_id
        ? supabase
            .from("competitor_listings")
            .select("*")
            .eq("id", competitor_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    let myListingData: any = myListingQuery.data;
    let existingComp: any = compByIdQuery.data;

    if (!existingComp && competitor_external_id) {
      const { data: compByExt } = await supabase
        .from("competitor_listings")
        .select("*")
        .eq("external_id", competitor_external_id)
        .eq("platform", platform)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingComp = compByExt;
    }

    // Garante userId a partir do registro existente no banco caso a chamada não tenha enviado token
    if (!userId) {
      userId = myListingData?.user_id || existingComp?.user_id || null;
    }
    if (!organizationId && myListingData?.organization_id) {
      organizationId = myListingData.organization_id;
    }

    // 3. Sincroniza e confere o anúncio próprio via API Oficial do Mercado Livre (/items, /sale_price, /seller-promotions)
    let myListingPriceResult: any = null;
    if (!isMyListingRadar) {
      try {
        myListingPriceResult = await syncSingleMyListingPrice(my_listing_id);
        if (myListingPriceResult?.success && myListingData) {
          if (myListingPriceResult.current_price !== undefined) {
            myListingData.current_price = myListingPriceResult.current_price;
          }
          if (myListingPriceResult.original_price !== undefined) {
            myListingData.original_price = myListingPriceResult.original_price;
          }
        }
      } catch (errSync) {
        console.warn(
          "[refresh-comparison] Aviso ao sincronizar preço próprio:",
          errSync
        );
      }
    }

    // Fallback para mock store se não encontrar no Supabase
    if (!myListingData) {
      const platKey = (platform as "mercadolivre" | "shopee") || "mercadolivre";
      const groupInMock = MOCK_COMPARATIVE_DATA[platKey]?.find(
        (g) => g.my_listing.id === my_listing_id
      );
      if (groupInMock) {
        if (myListingPriceResult?.current_price) {
          groupInMock.my_listing.current_price =
            myListingPriceResult.current_price;
          if (myListingPriceResult.original_price !== undefined) {
            groupInMock.my_listing.original_price =
              myListingPriceResult.original_price;
          }
        }
        myListingData = groupInMock.my_listing;
      } else if (existingComp) {
        myListingData = {
          id: my_listing_id,
          title: existingComp.title,
          current_price: Number(existingComp.current_price || 0),
          original_price: existingComp.original_price
            ? Number(existingComp.original_price)
            : null,
        };
      }
    }

    // 4. Resolução Multicamada dos Dados do Concorrente
    const rawPermalink =
      competitor_permalink || existingComp?.permalink || "";
    const rawExternalId =
      competitor_external_id || existingComp?.external_id || "";
    const normalizedPermalink = normalizeCompetitorPermalink(
      rawPermalink,
      rawExternalId,
      platform
    );

    const mlbId =
      extractMlbId(rawExternalId) ||
      extractMlbId(normalizedPermalink) ||
      extractMlbId(competitor_id);
    const mlbuId =
      extractMlbuId(normalizedPermalink) || extractMlbuId(rawExternalId);

    let partialData: Partial<VerifiedCompetitorData> = {};

    // Camada A: Dados extraídos diretamente pela extensão Chrome no navegador do usuário
    if (verified_data && typeof verified_data === "object") {
      const extPrice = parsePrice(
        verified_data.current_price ?? verified_data.price
      );
      const extOrig = verified_data.original_price
        ? parsePrice(verified_data.original_price)
        : null;

      partialData = {
        title: verified_data.title || undefined,
        current_price: extPrice > 0 ? extPrice : undefined,
        original_price:
          extOrig && extOrig > extPrice ? extOrig : undefined,
        seller_name: verified_data.seller_name
          ? cleanSellerName(verified_data.seller_name)
          : undefined,
        seller_reputation: verified_data.seller_reputation || undefined,
        shipping_type: verified_data.shipping_type || undefined,
        promo_badge: verified_data.promo_badge || undefined,
        thumbnail_url:
          verified_data.thumbnail_url || verified_data.image || undefined,
        sales_count_approx:
          verified_data.sales_count_approx !== undefined
            ? Number(verified_data.sales_count_approx)
            : undefined,
        listing_created_at: verified_data.listing_created_at || undefined,
        permalink: verified_data.permalink || normalizedPermalink || undefined,
        external_id:
          verified_data.external_id || rawExternalId || mlbId || undefined,
        source: "extension",
      };
    }

    // Camada B: API Oficial do Mercado Livre (autenticada com OAuth Token se disponível)
    if (
      (!partialData.current_price || partialData.current_price <= 0) &&
      platform === "mercadolivre"
    ) {
      const accessToken = await resolveAnyActiveMlToken(userId, organizationId);
      const apiResult = await fetchCompetitorViaMlApi({
        mlbId,
        mlbuId,
        title: partialData.title || existingComp?.title || null,
        sellerName:
          partialData.seller_name || existingComp?.seller_name || null,
        permalink: normalizedPermalink,
        accessToken,
      });

      if (apiResult) {
        partialData = {
          ...partialData,
          ...Object.fromEntries(
            Object.entries(apiResult).filter(
              ([_, v]) => v !== undefined && v !== null && v !== ""
            )
          ),
        };
      }
    }

    // Camada C: Web Scraper Multicamada (JSON-LD + Meta OpenGraph + Preloaded State + DOM + PoW Solver)
    if (
      (!partialData.current_price || partialData.current_price <= 0) &&
      normalizedPermalink
    ) {
      const scraped = await scrapeCompetitorFromUrl(
        normalizedPermalink,
        rawExternalId || mlbId
      );
      if (scraped) {
        partialData = {
          ...scraped,
          ...Object.fromEntries(
            Object.entries(partialData).filter(
              ([_, v]) => v !== undefined && v !== null && v !== ""
            )
          ),
          source: partialData.source || "html_scraper",
        };
      }
    }

    // Camada D: Consolidação com registro existente no Supabase (Garante Zero Erro 422 se WAF bloquear IP de nuvem)
    const finalPrice =
      partialData.current_price && partialData.current_price > 0
        ? partialData.current_price
        : existingComp?.current_price
        ? Number(existingComp.current_price)
        : 0;

    if (!finalPrice || finalPrice <= 0) {
      return NextResponse.json(
        {
          error:
            "Não foi possível verificar os dados do concorrente através do link informado.",
          details:
            "Certifique-se de que o link do anúncio do concorrente está ativo e acessível.",
        },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    const rawOrigPrice =
      partialData.original_price !== undefined
        ? partialData.original_price
        : existingComp?.original_price
        ? Number(existingComp.original_price)
        : null;
    const finalOriginalPrice =
      rawOrigPrice && rawOrigPrice > finalPrice ? rawOrigPrice : null;

    const finalTitle =
      partialData.title ||
      existingComp?.title ||
      `Anúncio Concorrente (${rawExternalId || mlbId || "MLB"})`;

    const finalSellerName = cleanSellerName(
      partialData.seller_name || existingComp?.seller_name || "Concorrente"
    );

    const finalReputation =
      partialData.seller_reputation ||
      existingComp?.seller_reputation ||
      "comum";

    const finalShipping =
      partialData.shipping_type || existingComp?.shipping_type || "padrao";

    const finalPromoBadge = cleanPromoBadge(
      partialData.promo_badge ?? existingComp?.promo_badge ?? null,
      finalPrice,
      finalOriginalPrice
    );

    const finalThumbnail =
      partialData.thumbnail_url || existingComp?.thumbnail_url || null;

    const finalSalesCount =
      partialData.sales_count_approx !== undefined &&
      partialData.sales_count_approx !== null
        ? partialData.sales_count_approx
        : Number(existingComp?.sales_count_approx || 0);

    const finalExternalId =
      partialData.external_id ||
      rawExternalId ||
      mlbId ||
      existingComp?.external_id ||
      `MLB${Date.now()}`;

    const finalPermalink =
      partialData.permalink ||
      normalizedPermalink ||
      existingComp?.permalink ||
      `https://produto.mercadolivre.com.br/MLB-${finalExternalId.replace(/^MLB-?/i, "")}`;

    const finalCreatedAt =
      partialData.listing_created_at ||
      (await refineMlCreationDateFromImage(finalExternalId, finalThumbnail)) ||
      estimateMlCreationDate(finalExternalId, finalThumbnail) ||
      existingComp?.listing_created_at ||
      null;

    const compVerified: VerifiedCompetitorData = {
      title: finalTitle,
      current_price: finalPrice,
      original_price: finalOriginalPrice,
      seller_name: finalSellerName,
      seller_reputation: finalReputation,
      shipping_type: finalShipping,
      promo_badge: finalPromoBadge,
      thumbnail_url: finalThumbnail,
      sales_count_approx: finalSalesCount,
      listing_created_at: finalCreatedAt,
      permalink: finalPermalink,
      external_id: finalExternalId,
      source: partialData.source || "database_verified",
    };

    // 5. Atualiza banco Supabase com dados conferidos e higienizados do concorrente
    let updatedCompetitorRow: any = existingComp;
    const nowIso = new Date().toISOString();

    try {
      const updateFields: Record<string, any> = {
        title: compVerified.title,
        current_price: compVerified.current_price,
        original_price: compVerified.original_price,
        seller_name: compVerified.seller_name,
        seller_reputation: compVerified.seller_reputation,
        shipping_type: compVerified.shipping_type,
        promo_badge: compVerified.promo_badge,
        permalink: compVerified.permalink,
        thumbnail_url: compVerified.thumbnail_url,
        sales_count_approx: compVerified.sales_count_approx,
        listing_created_at: compVerified.listing_created_at,
        last_scraped_at: nowIso,
        updated_at: nowIso,
      };

      if (existingComp?.id) {
        const { data: cData, error: cErr } = await supabase
          .from("competitor_listings")
          .update(updateFields)
          .eq("id", existingComp.id)
          .select()
          .maybeSingle();

        if (!cErr && cData) {
          updatedCompetitorRow = cData;
        }
      } else if (userId) {
        const { data: cData, error: cErr } = await supabase
          .from("competitor_listings")
          .upsert(
            {
              user_id: userId,
              platform: platform || "mercadolivre",
              external_id: compVerified.external_id,
              ...updateFields,
            },
            { onConflict: "user_id,platform,external_id" }
          )
          .select()
          .maybeSingle();

        if (!cErr && cData) {
          updatedCompetitorRow = cData;
        }
      }

      const targetCompIdForHistory =
        updatedCompetitorRow?.id || existingComp?.id || competitor_id;
      if (targetCompIdForHistory) {
        await supabase.from("price_history").insert({
          competitor_listing_id: targetCompIdForHistory,
          price: compVerified.current_price,
          recorded_at: nowIso,
        });
      }
    } catch (dbErr) {
      console.warn(
        "[refresh-comparison] Aviso ao gravar concorrente no Supabase:",
        dbErr
      );
    }

    // 6. Atualiza Mock Store em memória (para ambientes locais sem banco)
    const platKey = (platform as "mercadolivre" | "shopee") || "mercadolivre";
    const groupInMock = MOCK_COMPARATIVE_DATA[platKey]?.find(
      (g) => g.my_listing.id === my_listing_id
    );
    if (groupInMock) {
      if (myListingPriceResult?.current_price) {
        groupInMock.my_listing.current_price =
          myListingPriceResult.current_price;
        if (myListingPriceResult.original_price !== undefined) {
          groupInMock.my_listing.original_price =
            myListingPriceResult.original_price;
        }
      }

      const compInMock = groupInMock.competitors.find(
        (c) =>
          c.id === competitor_id || c.external_id === compVerified.external_id
      );
      if (compInMock) {
        compInMock.current_price = compVerified.current_price;
        compInMock.original_price = compVerified.original_price;
        compInMock.title = compVerified.title;
        compInMock.seller_name = compVerified.seller_name;
        compInMock.seller_reputation = compVerified.seller_reputation as any;
        compInMock.shipping_type = compVerified.shipping_type as any;
        compInMock.promo_badge = compVerified.promo_badge;
        if (compVerified.thumbnail_url) {
          compInMock.thumbnail_url = compVerified.thumbnail_url;
        }
        compInMock.sales_count_approx = compVerified.sales_count_approx;
        compInMock.last_scraped_at = nowIso;
      }
      recalculateGroupStatus(groupInMock);
    }

    // 7. Calcula discrepância exata e status final
    const myPrice = Number(myListingData?.current_price || 0);
    const compPrice = Number(compVerified.current_price);
    const diffBrl = Number((myPrice - compPrice).toFixed(2));
    const diffPct =
      compPrice > 0 ? Number(((diffBrl / compPrice) * 100).toFixed(2)) : 0;
    const status = diffBrl < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";

    const responsePayload = {
      success: true,
      message:
        "Dados conferidos e atualizados com sucesso via Mercado Livre e link do anúncio!",
      verified_at: nowIso,
      source: compVerified.source,
      my_listing: {
        id: my_listing_id,
        current_price: myPrice,
        original_price: myListingData?.original_price ?? null,
        title: myListingData?.title,
      },
      competitor: {
        id: updatedCompetitorRow?.id || existingComp?.id || competitor_id,
        ...compVerified,
        price_difference_brl: diffBrl,
        price_difference_pct: diffPct,
        last_scraped_at: nowIso,
      },
      comparison: {
        diff_brl: diffBrl,
        diff_pct: diffPct,
        status,
      },
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error: any) {
    console.error("[refresh-comparison] Erro inesperado:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao conferir e atualizar dados.",
        details: error?.message,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
