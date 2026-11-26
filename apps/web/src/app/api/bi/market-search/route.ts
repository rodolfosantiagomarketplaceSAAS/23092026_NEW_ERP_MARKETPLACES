import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getSyncedSearch, saveSyncedSearch } from "@/lib/data/marketSearchStore";
import { getActiveMarketplaceToken } from "@/lib/services/marketplaceIntegrations";
import { decryptSecret } from "@/lib/security/crypto";
import {
  fetchViaMlCatalogApi,
  fetchViaMlSitesSearchApi,
  fetchViaMlStructuredScraper,
  matchMyListingBySimilarity,
  readSearchSnapshotFromDb,
  saveSearchSnapshotToDb,
  type MarketSearchSource,
} from "@/lib/mercadolivre/market-search-engine";
import type {
  MarketSearchAnalytics,
  MarketSearchItem,
  MarketSearchResponse,
  MarketplacePlatform,
} from "@crm/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim() || "";
    const platformFilter = (searchParams.get("platform") || "all") as
      | MarketplacePlatform
      | "all";
    const limit = Math.min(
      100,
      Math.max(10, parseInt(searchParams.get("limit") || "40", 10))
    );
    const sort = searchParams.get("sort") || "relevance";
    const fresh = searchParams.get("fresh") === "true";
    const campaignOnly = searchParams.get("campaignOnly") === "true";
    const topRatedOnly = searchParams.get("topRated") === "true";
    const fastShippingOnly = searchParams.get("fastShipping") === "true";
    const freeShippingOnly = searchParams.get("freeShipping") === "true";
    const minPrice = searchParams.get("minPrice")
      ? parseFloat(searchParams.get("minPrice")!)
      : null;
    const maxPrice = searchParams.get("maxPrice")
      ? parseFloat(searchParams.get("maxPrice")!)
      : null;

    if (!query) {
      return NextResponse.json(
        { error: "Informe um termo de pesquisa válido." },
        { status: 400 }
      );
    }

    const ctx = await getAuthContext().catch(() => null);
    const tenantKey = ctx?.organizationId ?? ctx?.userId ?? "global";
    const supabase = createSupabaseAdminClient();

    // 1. Busca anúncios monitorados + anúncios próprios em paralelo (apenas colunas mínimas)
    const [existingCompetitorsRes, myListingsRes] = await Promise.all([
      supabase
        .from("competitor_listings")
        .select(
          "id, external_id, platform, title, current_price, permalink, thumbnail_url, seller_name, rating, shipping_type"
        )
        .limit(500),
      supabase
        .from("my_listings")
        .select("id, title, current_price, platform")
        .eq("status", "active")
        .limit(300),
    ]);

    const existingCompetitors = existingCompetitorsRes.data ?? [];
    const myListings = (myListingsRes.data ?? []).map((m) => ({
      id: String(m.id),
      title: String(m.title || ""),
      current_price: Number(m.current_price || 0),
      platform: String(m.platform || "mercadolivre"),
    }));

    const monitoredMap = new Map<string, string>();
    const savedShopeeListings: MarketSearchItem[] = [];

    for (const c of existingCompetitors) {
      monitoredMap.set(`${c.platform}:${c.external_id}`, c.id);
      if (c.platform === "shopee") {
        savedShopeeListings.push({
          id: c.external_id,
          platform: "shopee",
          external_id: c.external_id,
          title: c.title,
          current_price: Number(c.current_price),
          original_price: null,
          discount_pct: null,
          shipping_type: c.shipping_type || "shopee_xpress",
          is_free_shipping: true,
          is_full_or_flex: true,
          promo_badge: "Monitorado no Radar",
          campaign_type: "Radar Shopee",
          listing_type: "oficial",
          permalink: c.permalink,
          thumbnail_url: c.thumbnail_url,
          seller_name: c.seller_name || "Vendedor Shopee",
          seller_reputation: "indicado",
          sales_count_approx: 0,
          rating: Number(c.rating || 4.8),
          reviews_count: 0,
          is_already_monitored: true,
          matched_my_listing_id: null,
        });
      }
    }

    // 2. Pipeline Multicamada de Extração:
    //    Camada 1: Memória (Extensão) -> Cache Persistente Supabase (6h, se !fresh)
    //    Camada 2: API Oficial ML (/sites/MLB/search -> /products/search)
    //    Camada 3: Scraper Estruturado Server-Side (__PRELOADED_STATE__ + LD+JSON)
    let rawItems: MarketSearchItem[] = [];
    let resolvedSource: MarketSearchSource = "none";
    let fetchedAt = new Date().toISOString();

    if (!fresh) {
      const memSynced = getSyncedSearch(query, platformFilter);
      if (memSynced && memSynced.length > 0) {
        rawItems = [...memSynced];
        resolvedSource = "extension_live";
      }
    }

    if (rawItems.length === 0 && !fresh) {
      const dbSnapshot = await readSearchSnapshotFromDb({
        tenantKey,
        query,
        platform: platformFilter,
      });
      if (dbSnapshot && dbSnapshot.items.length > 0) {
        rawItems = [...dbSnapshot.items];
        resolvedSource = dbSnapshot.source;
        fetchedAt = dbSnapshot.fetchedAt;
      }
    }

    if (
      rawItems.length === 0 &&
      (platformFilter === "mercadolivre" || platformFilter === "all")
    ) {
      // Resolve token ativo do ML (se conectado)
      let activeMlToken =
        (await getActiveMarketplaceToken(
          "mercadolivre",
          ctx ? { userId: ctx.userId, organizationId: ctx.organizationId } : undefined
        ).catch(() => null)) ||
        process.env.ML_ACCESS_TOKEN ||
        process.env.MERCADOLIVRE_ACCESS_TOKEN ||
        null;

      if (!activeMlToken) {
        const { data: directRow } = await supabase
          .from("marketplace_integrations")
          .select("access_token")
          .eq("platform", "mercadolivre")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (directRow?.access_token) {
          try {
            activeMlToken = decryptSecret(directRow.access_token);
          } catch {}
        }
      }

      // Camada 2A: API Oficial /sites/MLB/search (anúncios orgânicos + catálogo)
      const sitesSearchItems = await fetchViaMlSitesSearchApi({
        query,
        limit: Math.max(limit, 40),
        sort,
        token: activeMlToken,
      });

      if (sitesSearchItems.length > 0) {
        rawItems = sitesSearchItems;
        resolvedSource = "ml_official_api";
      }

      // Camada 2B: Fallback API Oficial de Catálogo (/products/search)
      if (rawItems.length === 0 && activeMlToken) {
        const catalogItems = await fetchViaMlCatalogApi(
          query,
          Math.max(limit, 30),
          activeMlToken
        );
        if (catalogItems.length > 0) {
          rawItems = catalogItems;
          resolvedSource = "ml_catalog_api";
        }
      }

      // Camada 3: Scraper Estruturado (__PRELOADED_STATE__ + LD+JSON)
      if (rawItems.length === 0) {
        const scrapedItems = await fetchViaMlStructuredScraper(
          query,
          Math.max(limit, 40)
        );
        if (scrapedItems.length > 0) {
          rawItems = scrapedItems;
          resolvedSource = "server_scraper";
        }
      }

      // Salva no cache persistente (6h) + memória para acelerar próximas consultas e proteger cotas
      if (rawItems.length > 0) {
        fetchedAt = new Date().toISOString();
        saveSyncedSearch(query, "mercadolivre", rawItems);
        await saveSearchSnapshotToDb({
          organizationId: ctx?.organizationId ?? null,
          userId: ctx?.userId ?? null,
          tenantKey,
          query,
          platform: "mercadolivre",
          source: resolvedSource,
          items: rawItems,
        });
      }
    }

    // Incorpora Shopee monitorados se o filtro incluir Shopee
    if (platformFilter === "shopee" || platformFilter === "all") {
      const qWords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      const matchedShopee = savedShopeeListings.filter((s) => {
        const tLower = s.title.toLowerCase();
        return (
          tLower.includes(query.toLowerCase()) ||
          (qWords.length > 0 && qWords.every((word) => tLower.includes(word)))
        );
      });
      if (matchedShopee.length > 0) {
        const existingExtIds = new Set(
          rawItems.map((i) => `${i.platform}:${i.external_id}`)
        );
        for (const s of matchedShopee) {
          if (!existingExtIds.has(`${s.platform}:${s.external_id}`)) {
            rawItems.push(s);
          }
        }
      }
    }

    // 3. Marcação de monitorado e sugestão inteligente de pareamento (título + preço)
    let processedItems = rawItems.map((item) => {
      const isMonitored = monitoredMap.has(`${item.platform}:${item.external_id}`);
      const matchedMyListingId = matchMyListingBySimilarity(item, myListings);
      return {
        ...item,
        is_already_monitored: isMonitored,
        matched_my_listing_id: matchedMyListingId,
      };
    });

    // 4. Filtros
    if (campaignOnly) {
      processedItems = processedItems.filter((i) =>
        Boolean(i.promo_badge || i.discount_pct)
      );
    }
    if (topRatedOnly) {
      processedItems = processedItems.filter((i) => i.rating >= 4.7);
    }
    if (fastShippingOnly) {
      processedItems = processedItems.filter((i) => i.is_full_or_flex);
    }
    if (freeShippingOnly) {
      processedItems = processedItems.filter((i) => i.is_free_shipping);
    }
    if (minPrice !== null && !Number.isNaN(minPrice)) {
      processedItems = processedItems.filter((i) => i.current_price >= minPrice);
    }
    if (maxPrice !== null && !Number.isNaN(maxPrice)) {
      processedItems = processedItems.filter((i) => i.current_price <= maxPrice);
    }

    // 5. Ordenação
    if (sort === "price_asc") {
      processedItems.sort((a, b) => a.current_price - b.current_price);
    } else if (sort === "price_desc") {
      processedItems.sort((a, b) => b.current_price - a.current_price);
    } else if (sort === "rating_desc") {
      processedItems.sort(
        (a, b) => b.rating - a.rating || b.reviews_count - a.reviews_count
      );
    } else if (sort === "sales_desc") {
      processedItems.sort((a, b) => b.sales_count_approx - a.sales_count_approx);
    } else if (sort === "discount_desc") {
      processedItems.sort(
        (a, b) => (b.discount_pct || 0) - (a.discount_pct || 0)
      );
    }

    const finalItems = processedItems.slice(0, limit);

    // 6. Analytics do Nicho
    const prices = finalItems.map((i) => i.current_price).sort((a, b) => a - b);
    const totalFound = processedItems.length;
    const analyzedCount = finalItems.length;

    let minPriceVal = 0;
    let maxPriceVal = 0;
    let avgPriceVal = 0;
    let medianPriceVal = 0;

    if (prices.length > 0) {
      minPriceVal = Number(prices[0].toFixed(2));
      maxPriceVal = Number(prices[prices.length - 1].toFixed(2));
      avgPriceVal = Number(
        (prices.reduce((acc, curr) => acc + curr, 0) / prices.length).toFixed(2)
      );
      const mid = Math.floor(prices.length / 2);
      medianPriceVal = Number(
        (prices.length % 2 !== 0
          ? prices[mid]
          : (prices[mid - 1] + prices[mid]) / 2
        ).toFixed(2)
      );
    }

    const fastShippingCount = finalItems.filter((i) => i.is_full_or_flex).length;
    const freeShippingCount = finalItems.filter((i) => i.is_free_shipping).length;
    const campaignCount = finalItems.filter((i) =>
      Boolean(i.promo_badge || i.discount_pct)
    ).length;
    const ratingsSum = finalItems.reduce((acc, i) => acc + i.rating, 0);

    const fastShippingPct =
      analyzedCount > 0 ? Math.round((fastShippingCount / analyzedCount) * 100) : 0;
    const freeShippingPct =
      analyzedCount > 0 ? Math.round((freeShippingCount / analyzedCount) * 100) : 0;
    const campaignPct =
      analyzedCount > 0 ? Math.round((campaignCount / analyzedCount) * 100) : 0;
    const avgRating =
      analyzedCount > 0 ? Number((ratingsSum / analyzedCount).toFixed(1)) : 0;

    const priceBins = [];
    if (prices.length > 0) {
      const step = (maxPriceVal - minPriceVal) / 4 || 10;
      const b1 = minPriceVal + step;
      const b2 = minPriceVal + step * 2;
      const b3 = minPriceVal + step * 3;

      const bin1Count = finalItems.filter((i) => i.current_price <= b1).length;
      const bin2Count = finalItems.filter(
        (i) => i.current_price > b1 && i.current_price <= b2
      ).length;
      const bin3Count = finalItems.filter(
        (i) => i.current_price > b2 && i.current_price <= b3
      ).length;
      const bin4Count = finalItems.filter((i) => i.current_price > b3).length;

      priceBins.push(
        {
          range: `Até R$ ${b1.toFixed(0)}`,
          count: bin1Count,
          percentage: Math.round((bin1Count / analyzedCount) * 100),
        },
        {
          range: `R$ ${b1.toFixed(0)} a R$ ${b2.toFixed(0)}`,
          count: bin2Count,
          percentage: Math.round((bin2Count / analyzedCount) * 100),
        },
        {
          range: `R$ ${b2.toFixed(0)} a R$ ${b3.toFixed(0)}`,
          count: bin3Count,
          percentage: Math.round((bin3Count / analyzedCount) * 100),
        },
        {
          range: `Acima de R$ ${b3.toFixed(0)}`,
          count: bin4Count,
          percentage: Math.round((bin4Count / analyzedCount) * 100),
        }
      );
    }

    const sellerAgg: Record<
      string,
      { count: number; sumPrice: number; rep: string | null }
    > = {};
    finalItems.forEach((i) => {
      const sName = i.seller_name || "Vendedor Mercado Livre";
      if (!sellerAgg[sName]) {
        sellerAgg[sName] = { count: 0, sumPrice: 0, rep: i.seller_reputation };
      }
      sellerAgg[sName].count += 1;
      sellerAgg[sName].sumPrice += i.current_price;
    });

    const topSellers = Object.entries(sellerAgg)
      .map(([name, info]) => ({
        seller_name: name,
        listings_count: info.count,
        avg_price: Number((info.sumPrice / info.count).toFixed(2)),
        seller_reputation: info.rep,
      }))
      .sort((a, b) => b.listings_count - a.listings_count)
      .slice(0, 5);

    let opportunityScore = 75;
    if (campaignPct > 70) opportunityScore -= 10;
    if (fastShippingPct > 80) opportunityScore -= 10;
    if (maxPriceVal / (minPriceVal || 1) > 2.5) opportunityScore += 10;
    opportunityScore = Math.min(95, Math.max(40, opportunityScore));

    const analytics: MarketSearchAnalytics = {
      total_found: totalFound,
      analyzed_count: analyzedCount,
      min_price: minPriceVal,
      max_price: maxPriceVal,
      avg_price: avgPriceVal,
      median_price: medianPriceVal,
      fast_shipping_pct: fastShippingPct,
      free_shipping_pct: freeShippingPct,
      campaign_pct: campaignPct,
      avg_rating: avgRating,
      opportunity_score: opportunityScore,
      opportunity_label:
        opportunityScore > 70 ? "Alta Oportunidade" : "Concorrência Moderada",
      opportunity_insight:
        opportunityScore > 70
          ? "Nicho com boa dispersão de preços. Anúncios com envio rápido (Full/Flex) e kits bem precificados tendem a capturar maior conversão."
          : "Nicho competitivo com forte presença de envio rápido. Foque em diferenciação de título, fotos profissionais e margem líquida controlada.",
      price_distribution: priceBins,
      top_sellers: topSellers,
    };

    const response: MarketSearchResponse = {
      query,
      platform: platformFilter,
      limit,
      analytics,
      items: finalItems,
      needs_extension: finalItems.length === 0,
      source: resolvedSource,
      fetched_at: fetchedAt,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Erro na busca de inteligência de mercado:", error);
    return NextResponse.json(
      {
        error: "Falha ao processar pesquisa no Mercado Livre",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
