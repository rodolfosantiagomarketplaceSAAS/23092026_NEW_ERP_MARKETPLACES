import { NextRequest, NextResponse } from "next/server";
import { competitorSyncSchema } from "@/lib/validators/competitor";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";
import { addOrUpdateMockCompetitor } from "@/lib/data/comparativeStore";
import { resolveRequestUser } from "@/lib/extension/auth";
import {
  encodeCompetitorMetaInPermalink,
  estimateCompetitorFeesAndShipping,
  refineMlCreationDateFromImage,
} from "@/lib/services/competitorScraper";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. Autenticação: token da extensão (preferencial) ou JWT Supabase legado
    const authUser = await resolveRequestUser(req);
    let userId: string | null = authUser?.id ?? null;

    // Fallback apenas em desenvolvimento local (sem login na extensão)
    if (!userId && process.env.NODE_ENV !== "production") {
      try {
        const { data: users } = await supabase.auth.admin.listUsers();
        userId = users?.users?.[0]?.id ?? null;
      } catch {
        userId = null;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Extensão não conectada. Abra o ERP logado para conectar automaticamente." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // 2. Parse e Validação do Body via Zod
    const body = await req.json();
    const parseResult = competitorSyncSchema.safeParse(body);

    if (!parseResult.success) {
      console.warn("[API Sync] Erro de validação Zod:", parseResult.error.flatten().fieldErrors);
      return NextResponse.json(
        {
          error: "Payload de sincronização inválido",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const item = parseResult.data;

    // Atualiza cache em memória para resposta instantânea
    addOrUpdateMockCompetitor(item.platform, item.my_listing_id || null, item);

    let compData: any = null;
    let matched = false;

    // 3. Upsert na tabela competitor_listings do Supabase
    try {
      const fallbackFees = estimateCompetitorFeesAndShipping(
        item.current_price,
        item.platform,
        item.listing_type,
        item.external_id
      );
      const permalinkWithMeta = encodeCompetitorMetaInPermalink(item.permalink, {
        sale_fee_amount: item.sale_fee_amount ?? fallbackFees.sale_fee_amount,
        sale_fee_pct: item.sale_fee_pct ?? fallbackFees.sale_fee_pct,
        shipping_cost: item.shipping_cost ?? fallbackFees.shipping_cost,
        listing_type: item.listing_type ?? fallbackFees.listing_type,
      });

      const basePayload: any = {
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
        permalink: permalinkWithMeta,
        thumbnail_url: item.thumbnail_url || null,
        sales_count_approx: item.sales_count_approx,
        rating: item.rating,
        last_scraped_at: new Date().toISOString(),
      };

      const resolvedCreatedAt =
        item.listing_created_at ||
        (item.platform === "mercadolivre"
          ? await refineMlCreationDateFromImage(item.external_id, item.thumbnail_url)
          : null);

      if (resolvedCreatedAt) {
        basePayload.listing_created_at = resolvedCreatedAt;
      }

      let { data, error: compError } = await supabase
        .from("competitor_listings")
        .upsert(basePayload, { onConflict: "user_id,platform,external_id" })
        .select()
        .single();

      // Se a coluna listing_created_at ainda não existir no Postgres do Supabase, tenta novamente sem ela
      if (compError && (compError.message?.includes("listing_created_at") || compError.code === "42703")) {
        delete basePayload.listing_created_at;
        const retryResult = await supabase
          .from("competitor_listings")
          .upsert(basePayload, { onConflict: "user_id,platform,external_id" })
          .select()
          .single();
        data = retryResult.data;
        compError = retryResult.error;
      }

      if (compError) {
        console.error("[API Sync] Erro ao gravar no Supabase:", compError);
        return NextResponse.json(
          {
            error: `Falha no Supabase: ${compError.message}`,
            details: compError.hint || compError.details || compError.code,
          },
          { status: 500, headers: CORS_HEADERS }
        );
      }

      if (data) {
        compData = data;

        // Histórico de preços
        await supabase.from("price_history").insert({
          competitor_listing_id: compData.id,
          price: item.current_price,
          recorded_at: new Date().toISOString(),
        });

        // Vinculação em listing_matches (se my_listing_id foi enviado e for UUID)
        if (item.my_listing_id) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.my_listing_id);
          if (isUuid) {
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

            if (matchError) {
              console.error("[API Sync] Falha ao vincular concorrente ao anúncio próprio:", matchError);
            } else {
              matched = true;
              try {
                await syncSingleMyListingPrice(item.my_listing_id);
              } catch (sErr) {
                console.warn("[API Sync] Aviso ao sincronizar preço próprio:", sErr);
              }
            }
          } else {
            matched = true; // Pareamento mantido no cache
          }
        }
      }
    } catch (dbErr: any) {
      console.error("[API Sync] Exceção ao gravar no Supabase:", dbErr);
      return NextResponse.json(
        {
          error: "Erro ao comunicar com o banco Supabase",
          details: dbErr?.message || "Verifique se as variáveis de ambiente do Supabase estão configuradas na Vercel.",
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 4. Resposta de sucesso consistente
    return NextResponse.json(
      {
        success: true,
        message: "Anúncio concorrente sincronizado com sucesso",
        competitor_listing: compData || {
          id: `comp-${Date.now()}`,
          external_id: item.external_id,
          title: item.title,
          current_price: item.current_price,
          seller_name: item.seller_name,
        },
        matched_to_my_listing: matched,
        my_listing_id: item.my_listing_id || null,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[API Sync] Erro inesperado:", errorMsg);
    return NextResponse.json(
      { error: "Erro interno no servidor ao sincronizar concorrente", details: errorMsg },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
