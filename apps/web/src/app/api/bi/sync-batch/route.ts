import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";
import {
  cleanPromoBadge,
  cleanSellerName,
  extractMlbId,
  extractMlbuId,
  fetchCompetitorViaMlApi,
  normalizeCompetitorPermalink,
  resolveAnyActiveMlToken,
  scrapeCompetitorFromUrl,
} from "@/lib/services/competitorScraper";

const SyncBatchSchema = z.object({
  anuncioProprioIds: z.array(z.string().uuid()).optional(),
  platform: z.enum(["mercadolivre", "shopee"]).optional(),
  forceAll: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    const supabase = createSupabaseAdminClient();

    let payload = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const parsed = SyncBatchSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { anuncioProprioIds, platform } = parsed.data;

    // Constrói a consulta de vínculos de concorrentes ativos
    let query = supabase
      .from("listing_matches")
      .select(
        `
        id,
        user_id,
        my_listing_id,
        competitor_listing:competitor_listings (
          id,
          user_id,
          platform,
          external_id,
          title,
          current_price,
          original_price,
          seller_name,
          seller_reputation,
          shipping_type,
          promo_badge,
          permalink,
          thumbnail_url,
          sales_count_approx,
          last_scraped_at
        )
      `
      )
      .eq("is_active", true);

    if (user?.id) {
      query = query.eq("user_id", user.id);
    }

    if (anuncioProprioIds && anuncioProprioIds.length > 0) {
      query = query.in("my_listing_id", anuncioProprioIds);
    }

    const { data: matches, error: matchesError } = await query;

    if (matchesError) {
      console.error("[SyncBatch] Erro ao buscar vínculos:", matchesError);
      return NextResponse.json(
        { error: "Falha ao consultar anúncios vinculados no banco de dados." },
        { status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        success: true,
        totalItems: 0,
        message:
          "Nenhum anúncio concorrente vinculado encontrado para atualização.",
        updatedAt: new Date().toISOString(),
      });
    }

    // Filtra e deduplica concorrentes por ID
    const competitorMap = new Map<string, any>();
    matches.forEach((m: any) => {
      const c = m.competitor_listing;
      if (c && (!platform || c.platform === platform)) {
        competitorMap.set(c.id, c);
      }
    });

    const competitorsToSync = Array.from(competitorMap.values());
    const accessToken = await resolveAnyActiveMlToken(user?.id || null, null);
    const nowIso = new Date().toISOString();

    // Sincroniza cada concorrente em paralelo (API Oficial + Scraper Multicamada + Higienização)
    const historyRows: Array<{
      competitor_listing_id: string;
      price: number;
      recorded_at: string;
    }> = [];

    await Promise.allSettled(
      competitorsToSync.map(async (c) => {
        const normUrl = normalizeCompetitorPermalink(
          c.permalink,
          c.external_id,
          c.platform
        );
        const mlbId = extractMlbId(c.external_id) || extractMlbId(normUrl);
        const mlbuId = extractMlbuId(normUrl) || extractMlbuId(c.external_id);

        let updatedData =
          c.platform === "mercadolivre"
            ? await fetchCompetitorViaMlApi({
                mlbId,
                mlbuId,
                title: c.title,
                sellerName: c.seller_name,
                permalink: normUrl,
                accessToken,
              })
            : null;

        if (
          (!updatedData || !updatedData.current_price) &&
          normUrl
        ) {
          const scraped = await scrapeCompetitorFromUrl(normUrl, c.external_id);
          if (scraped) {
            updatedData = { ...updatedData, ...scraped };
          }
        }

        const newPrice =
          updatedData?.current_price && updatedData.current_price > 0
            ? updatedData.current_price
            : Number(c.current_price);

        const rawOrig =
          updatedData?.original_price !== undefined
            ? updatedData.original_price
            : c.original_price
            ? Number(c.original_price)
            : null;
        const newOrig = rawOrig && rawOrig > newPrice ? rawOrig : null;

        const cleanSeller = cleanSellerName(
          updatedData?.seller_name || c.seller_name
        );
        const cleanBadge = cleanPromoBadge(
          updatedData?.promo_badge ?? c.promo_badge,
          newPrice,
          newOrig
        );

        await supabase
          .from("competitor_listings")
          .update({
            title: updatedData?.title || c.title,
            current_price: newPrice,
            original_price: newOrig,
            seller_name: cleanSeller,
            seller_reputation:
              updatedData?.seller_reputation || c.seller_reputation || "comum",
            shipping_type:
              updatedData?.shipping_type || c.shipping_type || "padrao",
            promo_badge: cleanBadge,
            permalink: updatedData?.permalink || normUrl || c.permalink,
            thumbnail_url: updatedData?.thumbnail_url || c.thumbnail_url,
            sales_count_approx:
              updatedData?.sales_count_approx &&
              updatedData.sales_count_approx > 0
                ? updatedData.sales_count_approx
                : Number(c.sales_count_approx || 0),
            last_scraped_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", c.id);

        historyRows.push({
          competitor_listing_id: c.id,
          price: newPrice,
          recorded_at: nowIso,
        });
      })
    );

    if (historyRows.length > 0) {
      await supabase.from("price_history").insert(historyRows);
    }

    // Sincroniza em paralelo os preços promocionais atualizados dos anúncios próprios vinculados
    const uniqueMyListingIds = Array.from(
      new Set(matches.map((m: any) => m.my_listing_id).filter(Boolean))
    ) as string[];

    if (uniqueMyListingIds.length > 0) {
      await Promise.allSettled(
        uniqueMyListingIds.map((id) => syncSingleMyListingPrice(id))
      );
    }

    return NextResponse.json({
      success: true,
      totalMatchedListings: matches.length,
      totalUniqueCompetitors: competitorsToSync.length,
      message: `Varredura e sincronização em lote concluída com sucesso para ${competitorsToSync.length} anúncios concorrentes.`,
      updatedAt: nowIso,
    });
  } catch (error: any) {
    console.error("[SyncBatch] Erro não tratado:", error);
    return NextResponse.json(
      {
        error: "Erro interno no servidor ao processar sincronização em lote.",
      },
      { status: 500 }
    );
  }
}
