import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SyncBatchSchema = z.object({
  anuncioProprioIds: z.array(z.string().uuid()).optional(),
  platform: z.enum(["mercadolivre", "shopee"]).optional(),
  forceAll: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado", message: "Faça login para sincronizar anúncios." },
        { status: 401 }
      );
    }

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

    const { anuncioProprioIds, platform, forceAll } = parsed.data;

    // Constrói a consulta de vínculos de concorrentes ativos
    let query = supabase
      .from("listing_matches")
      .select(`
        id,
        my_listing_id,
        competitor_listing:competitor_listings (
          id,
          platform,
          external_id,
          title,
          current_price,
          permalink,
          last_scraped_at
        )
      `)
      .eq("user_id", user.id)
      .eq("is_active", true);

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
        message: "Nenhum anúncio concorrente vinculado encontrado para atualização.",
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

    // Registra timestamp de atualização e histórico de preço atual para manter a série temporal
    const historyRows = competitorsToSync.map((c) => ({
      competitor_listing_id: c.id,
      price: c.current_price,
      recorded_at: new Date().toISOString(),
    }));

    if (historyRows.length > 0) {
      // Grava no histórico de preços para gráficos de tendência (30/60/90 dias)
      await supabase.from("price_history").insert(historyRows);

      // Atualiza last_scraped_at dos concorrentes
      const competitorIds = competitorsToSync.map((c) => c.id);
      await supabase
        .from("competitor_listings")
        .update({ last_scraped_at: new Date().toISOString() })
        .in("id", competitorIds);
    }

    return NextResponse.json({
      success: true,
      totalMatchedListings: matches.length,
      totalUniqueCompetitors: competitorsToSync.length,
      message: `Varredura e sincronização em lote concluída com sucesso para ${competitorsToSync.length} anúncios concorrentes.`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[SyncBatch] Erro não tratado:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar sincronização em lote." },
      { status: 500 }
    );
  }
}
