import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getMemoryStoreListings, getMemoryStores } from "@/lib/data/competitorStoresStore";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const sort = searchParams.get("sort") || "most_sold"; // 'most_sold' | 'newest' | 'price_asc' | 'price_desc' | 'discount'
    const onlyNew = searchParams.get("onlyNew") === "true";
    const onlyFull = searchParams.get("onlyFull") === "true";
    const onlyFreeShipping = searchParams.get("onlyFreeShipping") === "true";
    const minPrice = searchParams.get("minPrice") ? parseFloat(searchParams.get("minPrice")!) : null;
    const maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : null;
    const minSales = searchParams.get("minSales") ? parseInt(searchParams.get("minSales")!, 10) : null;

    let listings = [];

    try {
      const supabase = createSupabaseAdminClient();
      let query = supabase.from("competitor_store_listings").select("*");

      if (id !== "all") {
        query = query.eq("store_id", id);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        if (data.length > 0) {
          listings = data;
        } else {
          listings = getMemoryStoreListings(id);
        }
      } else {
        listings = getMemoryStoreListings(id);
      }
    } catch {
      listings = getMemoryStoreListings(id);
    }

    // Attach store name and segment if not present
    const allStores = getMemoryStores();
    const storeMap = new Map(allStores.map((s) => [s.id, s]));

    listings = listings.map((l: any) => {
      const parentStore = storeMap.get(l.store_id);
      return {
        ...l,
        store_name: l.store_name || parentStore?.store_name || "Loja Concorrente",
        store_segment: l.store_segment || parentStore?.segment || "Geral",
      };
    });

    // Apply Filters
    let filtered = listings;

    if (search) {
      filtered = filtered.filter(
        (l: any) =>
          l.title.toLowerCase().includes(search) ||
          l.external_id.toLowerCase().includes(search) ||
          (l.store_name && l.store_name.toLowerCase().includes(search))
      );
    }

    if (onlyNew) {
      filtered = filtered.filter((l: any) => {
        if (!l.listing_created_at) return false;
        const d = new Date(l.listing_created_at);
        if (isNaN(d.getTime())) return false;
        const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 30; // Criado há até 30 dias
      });
    }

    if (onlyFull) {
      filtered = filtered.filter((l: any) => l.is_full === true || l.shipping_type === "ml_full");
    }

    if (onlyFreeShipping) {
      filtered = filtered.filter((l: any) => l.is_free_shipping === true);
    }

    if (minPrice !== null && !isNaN(minPrice)) {
      filtered = filtered.filter((l: any) => l.current_price >= minPrice);
    }

    if (maxPrice !== null && !isNaN(maxPrice)) {
      filtered = filtered.filter((l: any) => l.current_price <= maxPrice);
    }

    if (minSales !== null && !isNaN(minSales)) {
      filtered = filtered.filter((l: any) => (l.sales_count_approx || 0) >= minSales);
    }

    // Sorting
    filtered.sort((a: any, b: any) => {
      if (sort === "most_sold") {
        return (b.sales_count_approx || 0) - (a.sales_count_approx || 0);
      }
      if (sort === "newest") {
        const timeA = a.listing_created_at ? new Date(a.listing_created_at).getTime() : 0;
        const timeB = b.listing_created_at ? new Date(b.listing_created_at).getTime() : 0;
        return timeB - timeA;
      }
      if (sort === "price_asc") {
        return a.current_price - b.current_price;
      }
      if (sort === "price_desc") {
        return b.current_price - a.current_price;
      }
      if (sort === "discount") {
        return (b.discount_pct || 0) - (a.discount_pct || 0);
      }
      return 0;
    });

    // Summary calculations
    const totalListings = listings.length;
    const totalSales = listings.reduce((acc: number, l: any) => acc + (l.sales_count_approx || 0), 0);
    const newItemsCount = listings.filter((l: any) => {
      if (!l.listing_created_at) return false;
      const d = new Date(l.listing_created_at);
      return !isNaN(d.getTime()) && (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) <= 30;
    }).length;

    const bestSeller = [...listings].sort(
      (a: any, b: any) => (b.sales_count_approx || 0) - (a.sales_count_approx || 0)
    )[0] || null;

    return NextResponse.json({
      success: true,
      data: filtered,
      analytics: {
        total_items: totalListings,
        filtered_items: filtered.length,
        total_sales: totalSales,
        new_items_count: newItemsCount,
        best_seller: bestSeller,
      },
    });
  } catch (err: any) {
    console.error("[API Store Listings] Erro:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao carregar anúncios do concorrente." },
      { status: 500 }
    );
  }
}

