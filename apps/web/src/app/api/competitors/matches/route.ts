import { NextRequest, NextResponse } from "next/server";
import { removeCompetitorMatch, removeMyListing } from "@/lib/data/comparativeStore";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { my_listing_id, competitor_listing_id } = body;

    if (!my_listing_id || !competitor_listing_id) {
      return NextResponse.json(
        { error: "É necessário informar 'my_listing_id' e 'competitor_listing_id'." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // 1. Obtém o usuário associado ao anúncio próprio
    const { data: myListing } = await supabase
      .from("my_listings")
      .select("user_id")
      .eq("id", my_listing_id)
      .single();

    const userId = myListing?.user_id || "69ee4850-318b-4d9e-83ab-6743f264b6aa";

    // 2. Cria ou atualiza o vínculo no listing_matches
    const { error: matchError } = await supabase
      .from("listing_matches")
      .upsert(
        {
          user_id: userId,
          my_listing_id,
          competitor_listing_id,
          is_active: true,
        },
        { onConflict: "my_listing_id,competitor_listing_id" }
      );

    if (matchError) {
      console.error("[POST /api/competitors/matches] Erro ao parear:", matchError);
      return NextResponse.json(
        { error: "Falha ao registrar pareamento no banco de dados.", details: matchError.message },
        { status: 500 }
      );
    }

    // 3. Atualiza imediatamente o preço e status promocional do anúncio próprio direto do ML
    try {
      await syncSingleMyListingPrice(my_listing_id);
    } catch (syncErr) {
      console.warn("[POST /api/competitors/matches] Aviso ao sincronizar preço próprio:", syncErr);
    }

    return NextResponse.json({
      success: true,
      message: "Concorrente vinculado com sucesso ao seu anúncio!",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[POST /api/competitors/matches] Erro:", message);
    return NextResponse.json({ error: "Erro interno ao parear concorrente.", details: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const purgeUnlinked = searchParams.get("purge_unlinked") === "true";
    const competitorId = searchParams.get("competitor_id");
    const myListingId = searchParams.get("my_listing_id");

    const supabase = createSupabaseAdminClient();

    if (purgeUnlinked) {
      // Busca todos os IDs vinculados em listing_matches
      const { data: matches } = await supabase
        .from("listing_matches")
        .select("competitor_listing_id");

      const linkedIds = (matches || [])
        .map((m: any) => m.competitor_listing_id)
        .filter(Boolean);

      // Exclui todos os competitor_listings não vinculados
      let query = supabase.from("competitor_listings").delete();
      if (linkedIds.length > 0) {
        query = query.not("id", "in", `(${linkedIds.join(",")})`);
      }
      const { error: purgeError } = await query;
      if (purgeError) {
        console.error("[DELETE /api/competitors/matches purge] Erro:", purgeError);
        return NextResponse.json(
          { error: "Falha ao limpar anúncios avulsos do radar.", details: purgeError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Anúncios avulsos e testes do radar foram limpos com sucesso!",
      });
    }

    if (!competitorId && !myListingId) {
      return NextResponse.json(
        { error: "É necessário informar 'competitor_id' ou 'my_listing_id' para exclusão." },
        { status: 400 }
      );
    }

    // Identifica usuário pelo Authorization header se houver
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const supabase = createSupabaseAdminClient();
      const { data: authData } = await supabase.auth.getUser(token);
      if (authData?.user) {
        userId = authData.user.id;
      }
    }

    if (competitorId) {
      // Exclui o anúncio concorrente pareado
      await removeCompetitorMatch(myListingId || "", competitorId, userId);
      return NextResponse.json({
        success: true,
        message: "Concorrente removido do monitoramento com sucesso.",
        competitor_id: competitorId,
        my_listing_id: myListingId || null,
      });
    } else if (myListingId) {
      // Exclui o anúncio próprio do monitoramento
      await removeMyListing(myListingId, userId);
      return NextResponse.json({
        success: true,
        message: "Anúncio próprio removido do catálogo de monitoramento com sucesso.",
        my_listing_id: myListingId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[API DELETE Competitor] Erro:", message);
    return NextResponse.json(
      { error: "Falha ao remover anúncio do monitoramento.", details: message },
      { status: 500 }
    );
  }
}
