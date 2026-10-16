import { NextRequest, NextResponse } from "next/server";
import { saveSyncedSearch } from "@/lib/data/marketSearchStore";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { MarketSearchItem } from "@crm/types";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, platform, items } = body;

    if (!query || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Dados inválidos. 'query' e 'items' são obrigatórios." },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const cleanPlatform = (platform === "shopee" ? "shopee" : "mercadolivre") as "mercadolivre" | "shopee";

    // Salva no store em memória
    saveSyncedSearch(query, cleanPlatform, items as MarketSearchItem[]);

    // Persiste também no Supabase para suportar ambientes Serverless na nuvem (Vercel)
    try {
      const supabase = createSupabaseAdminClient();
      const { data: users } = await supabase.from("products").select("user_id").limit(1);
      const userId = users && users.length > 0 ? users[0].user_id : "00000000-0000-0000-0000-000000000000";

      const records = (items as MarketSearchItem[]).slice(0, 60).map((item) => ({
        user_id: userId,
        platform: cleanPlatform,
        external_id: item.external_id,
        seller_name: item.seller_name || "Vendedor do Marketplace",
        seller_reputation: item.seller_reputation || "platinum",
        title: item.title,
        current_price: Number(item.current_price) || 0,
        original_price: item.original_price ? Number(item.original_price) : null,
        shipping_type: item.shipping_type || "padrao",
        promo_badge: item.promo_badge || null,
        permalink: item.permalink || "",
        thumbnail_url: item.thumbnail_url || null,
        sales_count_approx: item.sales_count_approx || 0,
        rating: item.rating || 4.8,
        last_scraped_at: new Date().toISOString(),
      }));

      await supabase.from("competitor_listings").upsert(records, {
        onConflict: "user_id, platform, external_id",
        ignoreDuplicates: false,
      });
    } catch (dbErr) {
      console.warn("Aviso: falha ao persistir busca no Supabase:", dbErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: `${items.length} anúncios da pesquisa foram sincronizados com sucesso no ERP!`,
        count: items.length,
        query,
        platform: cleanPlatform,
        redirectUrl: `/inteligencia?q=${encodeURIComponent(query)}&platform=${cleanPlatform}`,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Erro no bulk-sync de pesquisa de mercado:", error);
    return NextResponse.json(
      { error: "Falha ao sincronizar pesquisa", details: error?.message },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
