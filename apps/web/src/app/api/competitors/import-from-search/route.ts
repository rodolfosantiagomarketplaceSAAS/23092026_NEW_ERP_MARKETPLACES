import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { importFromSearchSchema } from "@crm/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = importFromSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos para importação", issues: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      platform,
      external_id,
      seller_name,
      seller_reputation,
      title,
      current_price,
      original_price,
      shipping_type,
      promo_badge,
      permalink,
      thumbnail_url,
      sales_count_approx,
      rating,
      my_listing_id,
    } = parsed.data;

    const supabase = createSupabaseAdminClient();

    // 1. Obtém o usuário mestre/ativo para o tenant
    const { data: users } = await supabase.from("products").select("user_id").limit(1);
    const userId = users && users.length > 0 ? users[0].user_id : "00000000-0000-0000-0000-000000000000";

    // 2. Faz o Upsert na tabela competitor_listings
    const { data: compListing, error: compError } = await supabase
      .from("competitor_listings")
      .upsert(
        {
          user_id: userId,
          platform,
          external_id,
          seller_name: seller_name || "Vendedor do Marketplace",
          seller_reputation: seller_reputation || "comum",
          title,
          current_price,
          original_price: original_price || null,
          shipping_type: shipping_type || "padrao",
          promo_badge: promo_badge || null,
          permalink,
          thumbnail_url: thumbnail_url || null,
          sales_count_approx: sales_count_approx || 0,
          rating: rating || 5.0,
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform,external_id" }
      )
      .select()
      .single();

    if (compError) {
      console.error("Erro ao salvar concorrente pesquisado:", compError);
      return NextResponse.json(
        { error: "Falha ao salvar anúncio concorrente no banco de dados", details: compError.message },
        { status: 500 }
      );
    }

    // 3. Registra ponto inicial no price_history se for novo
    if (compListing) {
      await supabase.from("price_history").insert({
        competitor_listing_id: compListing.id,
        price: current_price,
        recorded_at: new Date().toISOString(),
      });
    }

    // 4. Se o usuário escolheu parear com um anúncio próprio, cria o listing_matches
    let matched = false;
    if (my_listing_id && compListing) {
      const { error: matchError } = await supabase
        .from("listing_matches")
        .upsert(
          {
            user_id: userId,
            my_listing_id: my_listing_id,
            competitor_listing_id: compListing.id,
            is_active: true,
          },
          { onConflict: "my_listing_id,competitor_listing_id" }
        );

      if (!matchError) {
        matched = true;
      } else {
        console.warn("Aviso ao criar pareamento listing_matches:", matchError);
      }
    }

    return NextResponse.json({
      success: true,
      message: matched
        ? "Anúncio importado e pareado com sucesso no Radar de Inteligência!"
        : "Anúncio adicionado ao banco de dados para monitoramento!",
      competitor_listing: compListing,
      matched,
    });
  } catch (err: any) {
    console.error("Erro no endpoint import-from-search:", err);
    return NextResponse.json(
      { error: "Erro interno ao processar importação", details: err?.message },
      { status: 500 }
    );
  }
}
