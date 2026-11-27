import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveUnifiedAuth } from "@/lib/auth/context";
import {
  getMemoryStores,
  updateMemoryStore,
  upsertMemoryStoreScrape,
} from "@/lib/data/competitorStoresStore";
import {
  isSlugOrGenericStoreName,
  resolveMercadoLivreStoreName,
} from "@/lib/services/competitorScraper";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const segment = searchParams.get("segment") || "all";
    const followingOnly = searchParams.get("followingOnly") === "true";

    const supabase = createSupabaseAdminClient();
    let stores: any[] = [];

    try {
      let query = supabase
        .from("competitor_stores")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("total_sales_approx", { ascending: false });

      if (segment !== "all") {
        query = query.eq("segment", segment);
      }

      if (followingOnly) {
        query = query.eq("is_following", true);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        stores = data;
      } else {
        stores = getMemoryStores(ctx.userId);
      }
    } catch {
      stores = getMemoryStores(ctx.userId);
    }

    // Performance: limita auto-heal a no máximo 3 lojas por chamada GET (elimina gargalo N+1!)
    const healCandidates = stores
      .filter((s: any) => {
        const rawName = s.store_name || "";
        const cleanedBadgeName = rawName.replace(/^\s*\(\d+\+?\)\s*/i, "").trim();
        const hasNotificationBadge = cleanedBadgeName !== rawName;
        const isGeneric = isSlugOrGenericStoreName(cleanedBadgeName, s.store_url);
        return (
          (s.platform === "mercadolivre" || !s.platform) &&
          s.store_url &&
          (isGeneric || hasNotificationBadge || !s.seller_nickname)
        );
      })
      .slice(0, 3);

    await Promise.all(
      healCandidates.map(async (s: any) => {
        const rawName = s.store_name || "";
        const cleanedBadgeName = rawName.replace(/^\s*\(\d+\+?\)\s*/i, "").trim();
        const hasNotificationBadge = cleanedBadgeName !== rawName;

        const resolved = await resolveMercadoLivreStoreName(
          s.store_url,
          cleanedBadgeName,
          undefined,
          s.seller_id
        );

        let finalName = resolved.storeName;
        if (!finalName || isSlugOrGenericStoreName(finalName, null)) {
          finalName = hasNotificationBadge ? cleanedBadgeName : s.store_name;
        }

        const finalNickname = s.seller_nickname || resolved.sellerNickname || null;

        if (finalName !== s.store_name || finalNickname !== s.seller_nickname) {
          s.store_name = finalName;
          if (finalNickname) s.seller_nickname = finalNickname;

          updateMemoryStore(s.id, { store_name: finalName }, ctx.userId);
          await supabase
            .from("competitor_stores")
            .update({
              store_name: finalName,
              ...(finalNickname ? { seller_nickname: finalNickname } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", s.id)
            .eq("user_id", ctx.userId);
        }
      })
    );

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
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const supabase = createSupabaseAdminClient();
    const userId = ctx.userId;

    const body = await req.json();
    const { store_name, store_url, segment, is_following, notes, platform, seller_id } = body;

    if (!store_name || !store_url) {
      return NextResponse.json(
        { error: "Nome da loja e URL são obrigatórios." },
        { status: 400 }
      );
    }

    const resolved =
      (platform || "mercadolivre") === "mercadolivre"
        ? await resolveMercadoLivreStoreName(store_url, store_name)
        : { storeName: store_name, sellerNickname: null };
    const finalStoreName = resolved.storeName || store_name;

    // Upsert in memory
    const { store } = upsertMemoryStoreScrape(
      {
        platform: platform || "mercadolivre",
        store_name: finalStoreName,
        seller_id: seller_id || null,
        seller_nickname: resolved.sellerNickname || null,
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
          store_name: finalStoreName,
          seller_id: seller_id || null,
          seller_nickname: resolved.sellerNickname || null,
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

