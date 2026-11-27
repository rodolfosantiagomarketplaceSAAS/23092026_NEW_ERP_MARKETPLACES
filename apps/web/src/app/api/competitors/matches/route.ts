import { NextRequest, NextResponse } from "next/server";
import { removeCompetitorMatch, removeMyListing } from "@/lib/data/comparativeStore";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveUnifiedAuth } from "@/lib/auth/context";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json();
    const { my_listing_id, competitor_listing_id } = body;

    if (!my_listing_id || !competitor_listing_id) {
      return NextResponse.json(
        { error: "É necessário informar 'my_listing_id' e 'competitor_listing_id'." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // Confere propriedade tanto do anúncio próprio quanto do concorrente (bloqueia IDOR!)
    const [{ data: myListing }, { data: compListing }] = await Promise.all([
      supabase
        .from("my_listings")
        .select("id")
        .eq("id", my_listing_id)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
      supabase
        .from("competitor_listings")
        .select("id")
        .eq("id", competitor_listing_id)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
    ]);

    if (!myListing || !compListing) {
      return NextResponse.json(
        { error: "Anúncio próprio ou concorrente não encontrado na sua conta." },
        { status: 404 }
      );
    }

    const { error: matchError } = await supabase
      .from("listing_matches")
      .upsert(
        {
          user_id: ctx.userId,
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

    await syncSingleMyListingPrice(my_listing_id, {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    }).catch((syncErr) =>
      console.warn("[POST /api/competitors/matches] Aviso ao sincronizar preço próprio:", syncErr)
    );

    return NextResponse.json({
      success: true,
      message: "Concorrente vinculado com sucesso ao seu anúncio!",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[POST /api/competitors/matches] Erro:", message);
    return NextResponse.json(
      { error: "Erro interno ao parear concorrente.", details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const purgeUnlinked = searchParams.get("purge_unlinked") === "true";
    const competitorId = searchParams.get("competitor_id");
    const myListingId = searchParams.get("my_listing_id");

    const supabase = createSupabaseAdminClient();

    if (purgeUnlinked) {
      // SEGURANÇA MULTI-TENANT: Limpa APENAS os concorrentes avulsos do `user_id` autenticado!
      const { data: matches } = await supabase
        .from("listing_matches")
        .select("competitor_listing_id")
        .eq("user_id", ctx.userId);

      const linkedIds = (matches || [])
        .map((m: { competitor_listing_id?: string | null }) => m.competitor_listing_id)
        .filter((id): id is string => Boolean(id) && /^[0-9a-f-]{36}$/i.test(String(id)));

      let query = supabase
        .from("competitor_listings")
        .delete()
        .eq("user_id", ctx.userId);

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
        message: "Anúncios avulsos do seu radar foram limpos com sucesso!",
      });
    }

    if (!competitorId && !myListingId) {
      return NextResponse.json(
        { error: "É necessário informar 'competitor_id' ou 'my_listing_id' para exclusão." },
        { status: 400 }
      );
    }

    if (competitorId) {
      await removeCompetitorMatch(myListingId || "", competitorId, ctx.userId);
      return NextResponse.json({
        success: true,
        message: "Concorrente removido do monitoramento com sucesso.",
        competitor_id: competitorId,
        my_listing_id: myListingId || null,
      });
    }

    if (myListingId) {
      await removeMyListing(myListingId, ctx.userId);
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
