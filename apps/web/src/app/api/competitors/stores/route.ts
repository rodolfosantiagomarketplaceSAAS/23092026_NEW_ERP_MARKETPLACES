import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getMemoryStores, hasDiskCache, upsertMemoryStoreScrape } from "@/lib/data/competitorStoresStore";
import { resolveRequestUser } from "@/lib/extension/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const segment = searchParams.get("segment") || "all";
    const followingOnly = searchParams.get("followingOnly") === "true";

    const supabaseAuth = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    const supabase = createSupabaseAdminClient();
    let stores: any[] = [];

    // Try Supabase first
    try {
      let query = supabase
        .from("competitor_stores")
        .select("*")
        .order("total_sales_approx", { ascending: false });

      if (user?.id) {
        query = query.eq("user_id", user.id);
      }

      if (segment !== "all") {
        query = query.eq("segment", segment);
      }

      if (followingOnly) {
        query = query.eq("is_following", true);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        // Se a consulta no banco funcionou, respeita fielmente os dados (inclusive lista vazia se o usuário excluiu lojas)
        stores = data;
      } else {
        stores = getMemoryStores();
      }
    } catch {
      stores = getMemoryStores();
    }

    // Filter in-memory/results
    let filtered = stores;
    if (search) {
      filtered = filtered.filter(
        (s: any) =>
          s.store_name.toLowerCase().includes(search) ||
          (s.seller_nickname && s.seller_nickname.toLowerCase().includes(search)) ||
          s.segment.toLowerCase().includes(search)
      );
    }
    if (segment !== "all") {
      filtered = filtered.filter((s: any) => s.segment.toLowerCase() === segment.toLowerCase());
    }
    if (followingOnly) {
      filtered = filtered.filter((s: any) => s.is_following === true);
    }

    // Summary Analytics
    const totalStores = stores.length;
    const followingCount = stores.filter((s: any) => s.is_following).length;
    const totalListings = stores.reduce((acc: number, s: any) => acc + (s.total_listings || 0), 0);
    const totalSalesApprox = stores.reduce((acc: number, s: any) => acc + (s.total_sales_approx || 0), 0);

    // List of available segments
    const segmentsSet = new Set<string>();
    stores.forEach((s: any) => {
      if (s.segment) segmentsSet.add(s.segment);
    });
    const segments = Array.from(segmentsSet);

    return NextResponse.json({
      success: true,
      data: filtered,
      analytics: {
        total_stores: totalStores,
        following_count: followingCount,
        total_listings: totalListings,
        total_sales_approx: totalSalesApprox,
        segments,
      },
    });
  } catch (err: any) {
    console.error("[API Competitor Stores] Erro:", err);
    return NextResponse.json(
      { error: err?.message || "Falha ao carregar lojas concorrentes" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveRequestUser(req);
    const supabase = createSupabaseAdminClient();
    const userId = authUser?.id || "demo-user-id";

    const body = await req.json();
    const { store_name, store_url, segment, is_following, notes, platform, seller_id } = body;

    if (!store_name || !store_url) {
      return NextResponse.json(
        { error: "Nome da loja e URL são obrigatórios." },
        { status: 400 }
      );
    }

    // Upsert in memory
    const { store } = upsertMemoryStoreScrape(
      {
        platform: platform || "mercadolivre",
        store_name,
        seller_id: seller_id || null,
        store_url,
        segment: segment || "Geral",
        is_following: is_following !== undefined ? is_following : true,
        notes: notes || null,
      },
      [],
      userId
    );

    // Upsert in DB if table exists
    try {
      await supabase.from("competitor_stores").upsert(
        {
          user_id: userId,
          platform: platform || "mercadolivre",
          store_name,
          seller_id: seller_id || null,
          store_url,
          segment: segment || "Geral",
          is_following: is_following !== undefined ? is_following : true,
          notes: notes || null,
          last_scraped_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform,store_url" }
      );
    } catch (dbErr) {
      console.warn("[API Competitor Stores] DB save note:", dbErr);
    }

    return NextResponse.json({
      success: true,
      message: "Loja concorrente cadastrada com sucesso!",
      data: store,
    });
  } catch (err: any) {
    console.error("[API Competitor Stores POST] Erro:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao salvar concorrente." },
      { status: 500 }
    );
  }
}

