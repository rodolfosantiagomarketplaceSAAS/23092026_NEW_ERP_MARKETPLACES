import { NextRequest, NextResponse } from "next/server";
import { competitorSyncSchema } from "@/lib/validators/competitor";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // 1. Extração do Bearer Token
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;

    const supabase = createSupabaseAdminClient();

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      
      // Validação do JWT com Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (!authError && authData.user) {
        userId = authData.user.id;
      }
    }

    // Se não autenticado via token real ou em desenvolvimento, fallback para o primeiro usuário ou demo
    if (!userId) {
      const { data: users } = await supabase.auth.admin.listUsers();
      userId = users?.users?.[0]?.id || "00000000-0000-0000-0000-000000000001";
    }

    // 2. Parse e Validação do Body via Zod
    const body = await req.json();
    const parseResult = competitorSyncSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Payload de sincronização inválido",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const item = parseResult.data;

    // 3. Upsert na tabela competitor_listings
    const { data: compData, error: compError } = await supabase
      .from("competitor_listings")
      .upsert(
        {
          user_id: userId,
          platform: item.platform,
          external_id: item.external_id,
          seller_name: item.seller_name,
          seller_reputation: item.seller_reputation || "comum",
          title: item.title,
          current_price: item.current_price,
          original_price: item.original_price || null,
          shipping_type: item.shipping_type,
          promo_badge: item.promo_badge || null,
          permalink: item.permalink,
          thumbnail_url: item.thumbnail_url || null,
          sales_count_approx: item.sales_count_approx,
          rating: item.rating,
          last_scraped_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform,external_id" }
      )
      .select()
      .single();

    if (compError) {
      console.error("[API Sync] Erro no upsert de competitor_listings:", compError);
      return NextResponse.json(
        { error: `Erro no banco de dados: ${compError.message}` },
        { status: 500 }
      );
    }

    // 4. Inserção explícita de Histórico de Preços (redundância segura caso triggers estejam desligados)
    await supabase.from("price_history").insert({
      competitor_listing_id: compData.id,
      price: item.current_price,
      recorded_at: new Date().toISOString(),
    });

    // 5. Vinculação em listing_matches (caso my_listing_id tenha sido enviado)
    let matched = false;
    if (item.my_listing_id) {
      const { error: matchError } = await supabase
        .from("listing_matches")
        .upsert(
          {
            user_id: userId,
            my_listing_id: item.my_listing_id,
            competitor_listing_id: compData.id,
            is_active: true,
          },
          { onConflict: "my_listing_id,competitor_listing_id" }
        );

      if (!matchError) {
        matched = true;
      } else {
        console.warn("[API Sync] Aviso ao vincular listing_matches:", matchError.message);
      }
    }

    // 6. Resposta sanitizada com status 200/201
    return NextResponse.json(
      {
        success: true,
        message: "Anúncio concorrente sincronizado com sucesso",
        competitor_listing: compData,
        matched_to_my_listing: matched,
        my_listing_id: item.my_listing_id || null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[API Sync] Erro inesperado:", errorMsg);
    return NextResponse.json(
      { error: "Erro interno no servidor ao sincronizar concorrente", details: errorMsg },
      { status: 500 }
    );
  }
}
