import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { MOCK_COMPARATIVE_DATA } from "@/lib/data/comparativeStore";
import type {
  BiComparativeResponse,
  ComparativeListingGroup,
  CompetitorComparisonItem,
  CompetitivenessStatus,
  MarketplacePlatform,
} from "@crm/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = (searchParams.get("platform") || "mercadolivre") as MarketplacePlatform;
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const statusFilter = searchParams.get("status") || "all";

    const supabase = createSupabaseAdminClient();

    // Consulta de anúncios próprios com produto vinculado
    const { data: myListings, error: myListingsError } = await supabase
      .from("my_listings")
      .select(`
        id,
        user_id,
        product_id,
        platform,
        external_id,
        title,
        current_price,
        permalink,
        thumbnail_url,
        shipping_type,
        listing_type,
        status,
        created_at,
        updated_at,
        products (
          sku,
          cost_price
        )
      `)
      .eq("platform", platform)
      .order("created_at", { ascending: false });

    // Se falhar ou não houver dados no banco, usa os dados do comparativeStore
    let groups: ComparativeListingGroup[] = [];
    const matchedCompetitorIds = new Set<string>();

    if (!myListingsError) {
      if (myListings && myListings.length > 0) {
        // Para cada anúncio próprio, busca os concorrentes pareados via listing_matches
        for (const item of myListings) {
          const { data: matches } = await supabase
            .from("listing_matches")
            .select(`
              competitor_listing_id,
              competitor_listings (*)
            `)
            .eq("my_listing_id", item.id)
            .eq("is_active", true);

          const myPrice = Number(item.current_price);
          const competitors: CompetitorComparisonItem[] = [];
          let lowestPrice: number | null = null;

          if (matches && matches.length > 0) {
            for (const m of matches) {
              const comp = m.competitor_listings as any;
              if (!comp) continue;

              matchedCompetitorIds.add(comp.id);
              const compPrice = Number(comp.current_price);
              if (lowestPrice === null || compPrice < lowestPrice) {
                lowestPrice = compPrice;
              }

              const diffBrl = myPrice - compPrice;
              const diffPct = compPrice > 0 ? (diffBrl / compPrice) * 100 : 0;

              competitors.push({
                id: comp.id,
                external_id: comp.external_id,
                seller_name: comp.seller_name,
                seller_reputation: comp.seller_reputation,
                title: comp.title,
                current_price: compPrice,
                original_price: comp.original_price ? Number(comp.original_price) : null,
                shipping_type: comp.shipping_type,
                promo_badge: comp.promo_badge,
                permalink: comp.permalink,
                thumbnail_url: comp.thumbnail_url,
                price_difference_brl: Number(diffBrl.toFixed(2)),
                price_difference_pct: Number(diffPct.toFixed(2)),
                last_scraped_at: comp.last_scraped_at,
                sales_count_approx: comp.sales_count_approx ?? 0,
                listing_created_at: comp.listing_created_at || comp.created_at || null,
                created_at: comp.created_at,
              });
            }
          }

          let status: CompetitivenessStatus = "UNMATCHED";
          let diffBrl: number | null = null;
          let diffPct: number | null = null;

          if (lowestPrice !== null) {
            diffBrl = Number((myPrice - lowestPrice).toFixed(2));
            diffPct = Number(((diffBrl / lowestPrice) * 100).toFixed(2));

            if (diffBrl < 0) {
              status = "WINNING"; // Nosso preço é mais baixo
            } else if (diffBrl === 0) {
              status = "TIED";
            } else {
              status = "LOSING"; // Concorrente tem preço menor
            }
          }

          const productData = Array.isArray(item.products) ? item.products[0] : item.products;

          groups.push({
            my_listing: {
              ...item,
              current_price: myPrice,
              product_sku: productData?.sku || null,
              product_cost_price: productData?.cost_price ? Number(productData.cost_price) : null,
              sales_count_approx: (item as any).sales_count_approx ?? 0,
              listing_created_at: (item as any).listing_created_at || item.created_at || null,
            },
            competitors,
            lowest_competitor_price: lowestPrice,
            diff_brl: diffBrl,
            diff_pct: diffPct,
            status,
          });
        }
      }

      // Adiciona concorrentes do banco que estão sem vínculo direto (Modo Radar de Mercado)
      const { data: unmatchedComps } = await supabase
        .from("competitor_listings")
        .select("*")
        .eq("platform", platform)
        .order("created_at", { ascending: false });

      if (unmatchedComps && unmatchedComps.length > 0) {
        for (const comp of unmatchedComps) {
          if (!matchedCompetitorIds.has(comp.id)) {
            const compPrice = Number(comp.current_price);
            const cleanExt = (comp.external_id || "PROD").replace(/[^A-Z0-9]/gi, "").slice(-8);
            groups.unshift({
              my_listing: {
                id: `radar-${comp.id}`,
                user_id: comp.user_id,
                product_id: null,
                platform: comp.platform,
                external_id: comp.external_id,
                title: `[Radar de Mercado] ${comp.title}`,
                current_price: compPrice,
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
              },
              competitors: [
                {
                  id: comp.id,
                  external_id: comp.external_id,
                  seller_name: comp.seller_name,
                  seller_reputation: comp.seller_reputation,
                  title: comp.title,
                  current_price: compPrice,
                  original_price: comp.original_price ? Number(comp.original_price) : null,
                  shipping_type: comp.shipping_type,
                  promo_badge: comp.promo_badge,
                  permalink: comp.permalink,
                  thumbnail_url: comp.thumbnail_url,
                  price_difference_brl: 0,
                  price_difference_pct: 0,
                  last_scraped_at: comp.last_scraped_at,
                  sales_count_approx: comp.sales_count_approx ?? 0,
                  listing_created_at: comp.listing_created_at || comp.created_at || null,
                  created_at: comp.created_at,
                },
              ],
              lowest_competitor_price: compPrice,
              diff_brl: 0,
              diff_pct: 0,
              status: "TIED",
            });
          }
        }
      }

      // Se nenhum item foi encontrado no banco, usa fallback em memória
      if (groups.length === 0) {
        groups = MOCK_COMPARATIVE_DATA[platform] || [];
      }
    } else {
      // Fallback em memória (inclui anúncios cadastrados ou capturados no Radar)
      groups = MOCK_COMPARATIVE_DATA[platform] || [];
    }

    // Aplicação de Filtros em memória
    let filtered = groups;

    if (search) {
      filtered = filtered.filter((g) => {
        const titleMatch = g.my_listing.title.toLowerCase().includes(search);
        const skuMatch = g.my_listing.product_sku?.toLowerCase().includes(search) || false;
        const extMatch = g.my_listing.external_id.toLowerCase().includes(search);
        const compMatch = g.competitors.some(
          (c) =>
            c.title.toLowerCase().includes(search) ||
            c.seller_name.toLowerCase().includes(search) ||
            c.external_id.toLowerCase().includes(search)
        );
        return titleMatch || skuMatch || extMatch || compMatch;
      });
    }

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "RADAR") {
        filtered = filtered.filter((g) => g.my_listing.listing_type === "radar");
      } else {
        filtered = filtered.filter((g) => g.status === statusFilter);
      }
    }

    // Sumário consolidado de KPIs
    const summary = {
      total_listings: groups.length,
      winning_count: groups.filter((g) => g.status === "WINNING" && g.my_listing.listing_type !== "radar").length,
      tied_count: groups.filter((g) => g.status === "TIED" && g.my_listing.listing_type !== "radar").length,
      losing_count: groups.filter((g) => g.status === "LOSING" && g.my_listing.listing_type !== "radar").length,
      unmatched_count: groups.filter((g) => g.status === "UNMATCHED").length,
      radar_count: groups.filter((g) => g.my_listing.listing_type === "radar").length,
    };

    const responseData: BiComparativeResponse = {
      platform,
      summary,
      items: filtered,
    };

    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[API BI Comparative] Erro:", message);
    return NextResponse.json(
      { error: "Erro ao gerar comparativo de BI", details: message },
      { status: 500 }
    );
  }
}
