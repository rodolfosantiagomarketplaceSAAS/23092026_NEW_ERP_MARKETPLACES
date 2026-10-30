import { NextRequest, NextResponse } from "next/server";
import { competitorStoreSyncSchema } from "@crm/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { upsertMemoryStoreScrape } from "@/lib/data/competitorStoresStore";
import { resolveRequestUser } from "@/lib/extension/auth";
import { estimateCompetitorFeesAndShipping } from "@/lib/services/competitorScraper";

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

    // 1. Resolve User (Extension Token or Auth Header or Default)
    const authUser = await resolveRequestUser(req);
    let userId: string | null = authUser?.id ?? null;

    if (!userId && process.env.NODE_ENV !== "production") {
      try {
        const { data: users } = await supabase.auth.admin.listUsers();
        userId = users?.users?.[0]?.id ?? "demo-user-id";
      } catch {
        userId = "demo-user-id";
      }
    }

    if (!userId) {
      userId = "demo-user-id";
    }

    // 2. Parse & Validate Payload
    const body = await req.json();
    const parseResult = competitorStoreSyncSchema.safeParse(body);

    if (!parseResult.success) {
      console.warn("[API Store Sync] Erro de validação Zod:", parseResult.error.flatten().fieldErrors);
      return NextResponse.json(
        {
          error: "Payload de sincronização de loja inválido.",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const {
      platform,
      store_name,
      seller_id,
      seller_nickname,
      store_url,
      segment,
      is_following,
      seller_reputation,
      notes,
      items,
    } = parseResult.data;

    // Enhance items with fee and net estimates if missing
    const enrichedItems = items.map((item) => {
      let fee = item.estimated_sale_fee;
      let net = item.estimated_net;
      if (!fee || fee <= 0) {
        const est = estimateCompetitorFeesAndShipping(item.current_price, platform, "gold_special", item.external_id);
        fee = est.sale_fee_amount || Number((item.current_price * 0.165).toFixed(2));
        net = Math.max(0, Number((item.current_price - fee - (est.shipping_cost || 0)).toFixed(2)));
      }
      return {
        ...item,
        estimated_sale_fee: fee,
        estimated_net: net,
      };
    });

    // 3. Update In-Memory Cache immediately
    const { store, listingsCount } = upsertMemoryStoreScrape(
      {
        platform,
        store_name,
        seller_id,
        seller_nickname,
        store_url,
        segment: segment || "Geral",
        is_following: is_following !== undefined ? is_following : true,
        seller_reputation: seller_reputation || "platinum",
        notes,
      },
      enrichedItems,
      userId
    );

    // 4. Upsert in Supabase if database table exists
    try {
      const { data: dbStore, error: storeErr } = await supabase
        .from("competitor_stores")
        .upsert(
          {
            user_id: userId,
            platform,
            store_name,
            seller_id: seller_id || null,
            seller_nickname: seller_nickname || null,
            store_url,
            segment: segment || "Geral",
            is_following: is_following !== undefined ? is_following : true,
            seller_reputation: seller_reputation || "platinum",
            notes: notes || null,
            total_listings: listingsCount,
            total_sales_approx: enrichedItems.reduce((acc, i) => acc + (i.sales_count_approx || 0), 0),
            avg_ticket: store.avg_ticket,
            last_scraped_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,store_url" }
        )
        .select()
        .single();

      if (!storeErr && dbStore?.id) {
        // Upsert items into competitor_store_listings
        const listingsToInsert = enrichedItems.map((item) => ({
          store_id: dbStore.id,
          user_id: userId,
          platform,
          external_id: item.external_id,
          title: item.title,
          current_price: item.current_price,
          original_price: item.original_price || null,
          discount_pct: item.discount_pct || null,
          sales_count_approx: item.sales_count_approx || 0,
          listing_created_at: item.listing_created_at || null,
          shipping_type: item.shipping_type || "padrao",
          is_full: item.is_full,
          is_free_shipping: item.is_free_shipping,
          promo_badge: item.promo_badge || null,
          permalink: item.permalink,
          thumbnail_url: item.thumbnail_url || null,
          rating: item.rating || 5.0,
          reviews_count: item.reviews_count || 0,
          estimated_sale_fee: item.estimated_sale_fee,
          estimated_net: item.estimated_net,
          last_scraped_at: new Date().toISOString(),
        }));

        await supabase
          .from("competitor_store_listings")
          .upsert(listingsToInsert, { onConflict: "user_id,store_id,external_id" });
      }
    } catch (dbErr) {
      console.warn("[API Store Sync] Supabase save notification (fallback active):", dbErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Loja ${store_name} sincronizada com sucesso! ${listingsCount} anúncios capturados.`,
        store,
        listings_count: listingsCount,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("[API Store Sync] Erro inesperado:", err);
    return NextResponse.json(
      { error: err?.message || "Erro interno ao sincronizar loja concorrente." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

