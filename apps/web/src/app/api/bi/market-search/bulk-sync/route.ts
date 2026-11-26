import { NextRequest, NextResponse } from "next/server";
import { saveSyncedSearch } from "@/lib/data/marketSearchStore";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveRequestUser } from "@/lib/extension/auth";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";
import { saveSearchSnapshotToDb } from "@/lib/mercadolivre/market-search-engine";
import type { MarketSearchItem } from "@crm/types";

export const dynamic = "force-dynamic";

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
    const body = await req.json();
    const { query, platform, items, my_listing_id } = body;

    if (!query || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Dados inválidos. 'query' e 'items' são obrigatórios." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cleanPlatform = (
      platform === "shopee" ? "shopee" : "mercadolivre"
    ) as "mercadolivre" | "shopee";

    // Deduplica itens pelo external_id
    const uniqueMap = new Map<string, MarketSearchItem>();
    for (const it of items as MarketSearchItem[]) {
      if (it?.external_id && Number(it.current_price) > 0 && !uniqueMap.has(it.external_id)) {
        uniqueMap.set(it.external_id, it);
      }
    }
    const cleanItems = Array.from(uniqueMap.values()).slice(0, 80);

    // 1. Salva no store em memória (instantâneo em dev / mesma instância)
    saveSyncedSearch(query, cleanPlatform, cleanItems);

    // 2. Identifica usuário/organização via token da extensão ou sessão
    const supabase = createSupabaseAdminClient();
    const authUser = await resolveRequestUser(req).catch(() => null);
    let userId: string | null = authUser?.id ?? null;
    let organizationId: string | null = null;

    if (userId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      organizationId = profile?.organization_id ?? null;
    } else {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id, organization_id")
        .limit(1)
        .maybeSingle();
      userId = profile?.id ?? null;
      organizationId = profile?.organization_id ?? null;
    }

    const tenantKey = organizationId ?? userId ?? "global";

    // 3. Persiste o snapshot no Supabase (6h TTL) — resolve Serverless multi-instância na Vercel!
    await saveSearchSnapshotToDb({
      organizationId,
      userId,
      tenantKey,
      query,
      platform: cleanPlatform,
      source: "extension_live",
      items: cleanItems,
    });

    // 4. Se o usuário vinculou a um anúncio próprio (`my_listing_id`), salva concorrentes + matches 1:N
    let totalMatched = 0;
    if (my_listing_id && userId && cleanItems.length > 0) {
      try {
        const records = cleanItems.slice(0, 50).map((item) => ({
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

        const { data: insertedComps, error: compError } = await supabase
          .from("competitor_listings")
          .upsert(records, {
            onConflict: "user_id, platform, external_id",
            ignoreDuplicates: false,
          })
          .select("id, current_price");

        if (!compError && insertedComps && insertedComps.length > 0) {
          const matchRecords = insertedComps.map((c) => ({
            user_id: userId,
            my_listing_id,
            competitor_listing_id: c.id,
            is_active: true,
          }));

          await supabase.from("listing_matches").upsert(matchRecords, {
            onConflict: "my_listing_id, competitor_listing_id",
          });

          totalMatched = matchRecords.length;

          try {
            await syncSingleMyListingPrice(my_listing_id);
          } catch (sErr) {
            console.warn("Aviso ao sincronizar preço do anúncio próprio:", sErr);
          }

          const historyRows = insertedComps.map((c) => ({
            competitor_listing_id: c.id,
            price: c.current_price,
            recorded_at: new Date().toISOString(),
          }));
          await supabase.from("price_history").insert(historyRows);
        }
      } catch (dbErr) {
        console.warn("Aviso ao vincular concorrentes no bulk-sync:", dbErr);
      }
    }

    const redirectUrl = my_listing_id
      ? `/inteligencia?tab=radar&platform=${cleanPlatform}`
      : `/inteligencia?tab=pesquisa&q=${encodeURIComponent(query)}&platform=${cleanPlatform}`;

    return NextResponse.json(
      {
        success: true,
        message: my_listing_id
          ? `✅ ${cleanItems.length} concorrentes vinculados com sucesso ao seu anúncio no Radar Comparativo!`
          : `${cleanItems.length} anúncios da pesquisa foram sincronizados com sucesso no ERP!`,
        count: cleanItems.length,
        totalMatched,
        query,
        platform: cleanPlatform,
        redirectUrl,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error("Erro no bulk-sync de pesquisa de mercado:", error);
    return NextResponse.json(
      { error: "Falha ao sincronizar pesquisa", details: error?.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
