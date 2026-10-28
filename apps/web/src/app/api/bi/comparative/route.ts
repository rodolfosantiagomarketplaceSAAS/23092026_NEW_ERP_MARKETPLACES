import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  cleanPromoBadge,
  cleanSellerName,
  estimateMlCreationDate,
  normalizeCompetitorPermalink,
} from "@/lib/services/competitorScraper";
import type {
  BiComparativeResponse,
  ComparativeListingGroup,
  CompetitorComparisonItem,
  CompetitivenessStatus,
  MarketplacePlatform,
} from "@crm/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, any>;

// Display priority: actionable groups first, then radar, then listings without competitors
const STATUS_ORDER: Record<CompetitivenessStatus, number> = {
  LOSING: 0,
  TIED: 1,
  WINNING: 2,
  UNMATCHED: 4,
};

function toCompetitorItem(comp: Row, referencePrice: number): CompetitorComparisonItem {
  const compPrice = Number(comp.current_price);
  const origPrice = comp.original_price ? Number(comp.original_price) : null;
  const diffBrl = referencePrice - compPrice;
  const diffPct = compPrice > 0 ? (diffBrl / compPrice) * 100 : 0;

  const estCreatedAt = estimateMlCreationDate(comp.external_id, comp.thumbnail_url);
  let resolvedCreatedAt = comp.listing_created_at || estCreatedAt || comp.created_at || null;
  if (comp.listing_created_at && estCreatedAt) {
    const dbTime = new Date(comp.listing_created_at).getTime();
    const estTime = new Date(estCreatedAt).getTime();
    if (!isNaN(dbTime) && !isNaN(estTime) && dbTime > estTime + 45 * 86400000) {
      resolvedCreatedAt = estCreatedAt;
    }
  }

  return {
    id: comp.id,
    external_id: comp.external_id,
    seller_name: cleanSellerName(comp.seller_name),
    seller_reputation: comp.seller_reputation,
    title: comp.title,
    current_price: compPrice,
    original_price: origPrice && origPrice > compPrice ? origPrice : null,
    shipping_type: comp.shipping_type,
    promo_badge: cleanPromoBadge(comp.promo_badge, compPrice, origPrice),
    permalink: normalizeCompetitorPermalink(comp.permalink, comp.external_id, comp.platform) || comp.permalink,
    thumbnail_url: comp.thumbnail_url,
    price_difference_brl: Number(diffBrl.toFixed(2)),
    price_difference_pct: Number(diffPct.toFixed(2)),
    last_scraped_at: comp.last_scraped_at,
    sales_count_approx: comp.sales_count_approx ?? 0,
    listing_created_at: resolvedCreatedAt,
    created_at: comp.created_at,
  };
}

function buildMyListingGroup(item: Row, matchedIds: Set<string>): ComparativeListingGroup {
  const myPrice = Number(item.current_price);
  const activeComps: Row[] = (item.listing_matches || [])
    .filter((m: Row) => m.is_active && m.competitor_listings)
    .map((m: Row) => m.competitor_listings);

  activeComps.forEach((c) => matchedIds.add(c.id));
  const competitors = activeComps
    .map((c) => toCompetitorItem(c, myPrice))
    .sort((a, b) => a.current_price - b.current_price);

  const lowestPrice = competitors.length ? Math.min(...competitors.map((c) => c.current_price)) : null;
  let status: CompetitivenessStatus = "UNMATCHED";
  let diffBrl: number | null = null;
  let diffPct: number | null = null;

  if (lowestPrice !== null) {
    diffBrl = Number((myPrice - lowestPrice).toFixed(2));
    diffPct = lowestPrice > 0 ? Number(((diffBrl / lowestPrice) * 100).toFixed(2)) : 0;
    status = diffBrl < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";
  }

  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  const { listing_matches: _matches, products: _products, ...listing } = item;

  return {
    my_listing: {
      ...(listing as any),
      current_price: myPrice,
      original_price: item.original_price ? Number(item.original_price) : null,
      product_sku: product?.sku || null,
      product_cost_price: product?.cost_price ? Number(product.cost_price) : null,
      sales_count_approx: item.sales_count_approx ?? item.sold_quantity ?? 0,
      listing_created_at:
        item.listing_created_at ||
        item.raw_data?.date_created ||
        item.raw_data?.start_time ||
        estimateMlCreationDate(item.external_id, item.thumbnail_url) ||
        item.created_at ||
        null,
    },
    competitors,
    lowest_competitor_price: lowestPrice,
    diff_brl: diffBrl,
    diff_pct: diffPct,
    status,
  };
}

function buildRadarGroup(comp: Row): ComparativeListingGroup {
  const compPrice = Number(comp.current_price);
  const cleanExt = (comp.external_id || "PROD").replace(/[^A-Z0-9]/gi, "").slice(-8);

  return {
    my_listing: {
      id: `radar-${comp.id}`,
      user_id: comp.user_id,
      product_id: null,
      platform: comp.platform,
      external_id: comp.external_id,
      title: `[Radar de Mercado] ${comp.title}`,
      current_price: compPrice,
      original_price: comp.original_price ? Number(comp.original_price) : null,
      permalink: comp.permalink,
      thumbnail_url: comp.thumbnail_url || null,
      shipping_type: comp.shipping_type || "padrao",
      listing_type: "radar",
      status: "active",
      created_at: comp.listing_created_at || comp.created_at,
      updated_at: comp.updated_at,
      product_sku: `RADAR-${cleanExt}`,
      product_cost_price: null,
      sales_count_approx: comp.sales_count_approx ?? 0,
      listing_created_at: comp.listing_created_at || comp.created_at || null,
    } as any,
    competitors: [toCompetitorItem(comp, compPrice)],
    lowest_competitor_price: compPrice,
    diff_brl: 0,
    diff_pct: 0,
    status: "TIED",
  };
}

function sortRank(g: ComparativeListingGroup): number {
  if (g.my_listing.listing_type === "radar") return 3;
  return STATUS_ORDER[g.status] ?? 5;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = (searchParams.get("platform") || "mercadolivre") as MarketplacePlatform;
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const statusFilter = searchParams.get("status") || "all";

    const supabase = createSupabaseAdminClient();

    // 2 queries in parallel (was 1 + N sequential queries → timeouts on Vercel)
    const [myListingsRes, competitorsRes] = await Promise.all([
      supabase
        .from("my_listings")
        .select("*, products ( sku, cost_price ), listing_matches ( is_active, competitor_listings ( * ) )")
        .eq("platform", platform)
        .order("created_at", { ascending: false }),
      supabase
        .from("competitor_listings")
        .select("*")
        .eq("platform", platform)
        .order("last_scraped_at", { ascending: false }),
    ]);

    if (myListingsRes.error || competitorsRes.error) {
      const dbError = myListingsRes.error || competitorsRes.error;
      console.error("[API BI Comparative] Erro Supabase:", dbError);
      return NextResponse.json(
        { error: "Falha ao consultar o banco de dados", details: dbError?.message },
        { status: 500 }
      );
    }

    const matchedIds = new Set<string>();
    const listingGroups = (myListingsRes.data || []).map((item) => buildMyListingGroup(item, matchedIds));
    const radarGroups = (competitorsRes.data || [])
      .filter((comp) => !matchedIds.has(comp.id))
      .map(buildRadarGroup);

    const groups = [...listingGroups, ...radarGroups].sort((a, b) => sortRank(a) - sortRank(b));

    let filtered = groups;

    if (search) {
      filtered = filtered.filter((g) => {
        const l = g.my_listing;
        return (
          l.title.toLowerCase().includes(search) ||
          (l.product_sku?.toLowerCase().includes(search) ?? false) ||
          l.external_id.toLowerCase().includes(search) ||
          g.competitors.some(
            (c) =>
              c.title.toLowerCase().includes(search) ||
              (c.seller_name || "").toLowerCase().includes(search) ||
              c.external_id.toLowerCase().includes(search)
          )
        );
      });
    }

    if (statusFilter === "MONITORED" || statusFilter === "PAIRED") {
      filtered = filtered.filter((g) => g.competitors.length > 0 && g.my_listing.listing_type !== "radar");
    } else if (statusFilter !== "all") {
      filtered =
        statusFilter === "RADAR"
          ? filtered.filter((g) => g.my_listing.listing_type === "radar")
          : filtered.filter((g) => g.status === statusFilter && g.my_listing.listing_type !== "radar");
    }

    const isOwn = (g: ComparativeListingGroup) => g.my_listing.listing_type !== "radar";
    const summary = {
      total_listings: groups.length,
      monitored_count: groups.filter((g) => isOwn(g) && g.competitors.length > 0).length,
      winning_count: groups.filter((g) => isOwn(g) && g.status === "WINNING").length,
      tied_count: groups.filter((g) => isOwn(g) && g.status === "TIED").length,
      losing_count: groups.filter((g) => isOwn(g) && g.status === "LOSING").length,
      unmatched_count: groups.filter((g) => isOwn(g) && g.status === "UNMATCHED").length,
      radar_count: radarGroups.length,
    };

    const responseData: BiComparativeResponse = { platform, summary, items: filtered };

    return NextResponse.json(responseData, {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[API BI Comparative] Erro:", message);
    return NextResponse.json({ error: "Erro ao gerar comparativo de BI", details: message }, { status: 500 });
  }
}
