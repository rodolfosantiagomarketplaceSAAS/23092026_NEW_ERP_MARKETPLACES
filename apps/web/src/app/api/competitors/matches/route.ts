import { NextRequest, NextResponse } from "next/server";
import { removeCompetitorMatch, removeMyListing } from "@/lib/data/comparativeStore";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const competitorId = searchParams.get("competitor_id");
    const myListingId = searchParams.get("my_listing_id");

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
