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

    // 2. Parse & Validate Payload defensively
    const rawBody = await req.json();
    const rawItems = Array.isArray(rawBody?.items) ? rawBody.items : [];
    const seenExtIds = new Set<string>();
    const sanitizedItems = [];

    for (let idx = 0; idx < rawItems.length; idx++) {
      const it = rawItems[idx];
      if (!it || (!it.external_id && !it.permalink && !it.title)) continue;
      const extId = (it.external_id || "").trim() || `ITEM_${Date.now()}_${idx}`;
      if (seenExtIds.has(extId)) continue;
      seenExtIds.add(extId);

      const price =
        typeof it.current_price === "number"
          ? it.current_price
          : parseFloat(String(it.current_price || "0").replace(/[^0-9.,]/g, "").replace(",", ".")) || 1.0;
      const origPrice = it.original_price
        ? typeof it.original_price === "number"
          ? it.original_price
          : parseFloat(String(it.original_price).replace(/[^0-9.,]/g, "").replace(",", "."))
        : null;
      const discPct = it.discount_pct ? Number(it.discount_pct) : null;
      const sales =
        typeof it.sales_count_approx === "number"
          ? it.sales_count_approx
          : parseInt(String(it.sales_count_approx || "0").replace(/\D/g, ""), 10) || 0;
      const rating =
        typeof it.rating === "number" ? it.rating : parseFloat(String(it.rating || "5")) || 5.0;
      const reviews =
        typeof it.reviews_count === "number"
          ? it.reviews_count
          : parseInt(String(it.reviews_count || "0").replace(/\D/g, ""), 10) || 0;

      const isCatalog = !!it.is_catalog || (it.permalink && it.permalink.includes("/p/MLB"));
      const listingType = it.listing_type || (it.is_full ? "gold_pro" : "gold_special");

      sanitizedItems.push({
        external_id: extId,
        title: (it.title || "Anúncio do Concorrente").trim(),
        current_price: price > 0 ? price : 1.0,
        original_price: origPrice && origPrice > 0 ? origPrice : null,
        discount_pct: discPct,
        sales_count_approx: sales,
        listing_created_at: it.listing_created_at || null,
        shipping_type: it.shipping_type || (it.is_full ? "ml_full" : "padrao"),
        is_full: !!it.is_full,
        is_free_shipping: !!it.is_free_shipping,
        promo_badge: it.promo_badge || null,
        permalink: it.permalink || (isCatalog ? `https://www.mercadolivre.com.br/p/${extId}` : `https://produto.mercadolivre.com.br/${extId}`),
        thumbnail_url: it.thumbnail_url || null,
        rating: Math.min(5, Math.max(0, rating)),
        reviews_count: reviews,
        estimated_sale_fee: typeof it.estimated_sale_fee === "number" ? it.estimated_sale_fee : 0,
        estimated_net: typeof it.estimated_net === "number" ? it.estimated_net : 0,
        estimated_shipping: typeof it.estimated_shipping === "number" ? it.estimated_shipping : null,
        listing_type: listingType,
        is_catalog: isCatalog,
      });
    }

    const sanitizedBody = {
      ...rawBody,
      platform: rawBody?.platform || "mercadolivre",
      store_name: (rawBody?.store_name || "Loja Concorrente").trim(),
      store_url: (rawBody?.store_url || "https://www.mercadolivre.com.br").trim(),
      segment: (rawBody?.segment || "Geral").trim(),
      is_following: rawBody?.is_following !== undefined ? !!rawBody.is_following : true,
      seller_reputation: rawBody?.seller_reputation || "platinum",
      items: sanitizedItems,
    };

    const parseResult = competitorStoreSyncSchema.safeParse(sanitizedBody);

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
      let shippingCost = item.estimated_shipping ?? null;
      const listingType = item.listing_type || (item.is_full ? "gold_pro" : "gold_special");

      if (!fee || fee <= 0 || !net || net <= 0) {
        const est = estimateCompetitorFeesAndShipping(item.current_price, platform, listingType, item.external_id);
        fee = fee && fee > 0 ? fee : est.sale_fee_amount || Number((item.current_price * 0.165).toFixed(2));
        shippingCost = shippingCost !== null ? shippingCost : (est.shipping_cost || 0);
        net = Math.max(0, Number((item.current_price - fee - (shippingCost || 0)).toFixed(2)));
      }
      return {
        ...item,
        listing_type: listingType,
        estimated_sale_fee: fee,
        estimated_net: net,
        estimated_shipping: shippingCost,
      };
    });

    const totalListingsExpected = typeof rawBody?.total_listings === "number" && rawBody.total_listings > 0
      ? rawBody.total_listings
      : enrichedItems.length;

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
        total_listings: totalListingsExpected,
      },
      enrichedItems,
      userId
    );

    // 4. Upsert in Supabase if database table exists
    try {
      // Vendas diretas da loja (não infla com 100k de Buy Box de catálogo global)
      const storeDirectSales = enrichedItems.reduce((acc, i) => {
        if (i.is_catalog) {
          return acc + Math.min(i.sales_count_approx || 0, 50);
        }
        return acc + (i.sales_count_approx || 0);
      }, 0);

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
            total_listings: totalListingsExpected,
            total_sales_approx: storeDirectSales,
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
        message: `Loja ${store_name} sincronizada com sucesso! ${listingsCount} anúncios únicos capturados (total informado: ${totalListingsExpected}).`,
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
