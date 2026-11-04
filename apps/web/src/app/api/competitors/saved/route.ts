import { NextResponse } from "next/server";
import {
  listSavedOpportunityListings,
  upsertSavedOpportunityListing,
} from "@/lib/data/savedListingsStore";
import {
  cleanPromoBadge,
  cleanSellerName,
  estimateCompetitorFeesAndShipping,
  estimateMlCreationDate,
  extractMlbId,
  extractMlbuId,
  fetchCompetitorViaMlApi,
  normalizeCompetitorPermalink,
  refineMlCreationDateFromImage,
  resolveAnyActiveMlToken,
  scrapeCompetitorFromUrl,
} from "@/lib/services/competitorScraper";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status"); // "all" | "pending" | "created"
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    const allItems = await listSavedOpportunityListings();

    const totalCount = allItems.length;
    const pendingCount = allItems.filter((i) => i.status === "pending").length;
    const createdCount = allItems.filter((i) => i.status === "created").length;

    let filtered = allItems;
    if (statusFilter === "pending" || statusFilter === "created") {
      filtered = filtered.filter((i) => i.status === statusFilter);
    }

    if (search) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          i.external_id.toLowerCase().includes(search) ||
          (i.seller_name || "").toLowerCase().includes(search) ||
          (i.store_segment || "").toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      success: true,
      counts: {
        total: totalCount,
        pending: pendingCount,
        created: createdCount,
      },
      data: filtered,
    });
  } catch (error: any) {
    console.error("[GET /api/competitors/saved] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Falha ao listar anúncios salvos.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const rawUrl = String(body.url || body.permalink || "").trim();
    const rawExtId = String(body.external_id || "").trim();

    const platform: "mercadolivre" | "shopee" =
      body.platform === "shopee" || rawUrl.includes("shopee.com")
        ? "shopee"
        : "mercadolivre";

    let externalId =
      extractMlbId(rawExtId) ||
      extractMlbId(rawUrl) ||
      extractMlbuId(rawExtId) ||
      extractMlbuId(rawUrl) ||
      rawExtId;

    // Se o usuário enviou apenas um link (ou código MLB) sem os dados completos,
    // ou solicitou webscraping completo (scrapeNow: true), executamos o scraper multicamada!
    const needsScraping =
      Boolean(body.scrapeNow) ||
      !body.title ||
      !body.current_price ||
      Number(body.current_price) <= 0;

    let scraped: any = {};

    if (needsScraping && (rawUrl || externalId)) {
      const mlbId = extractMlbId(externalId) || extractMlbId(rawUrl);
      const mlbuId = extractMlbuId(externalId) || extractMlbuId(rawUrl);
      const token =
        platform === "mercadolivre" ? await resolveAnyActiveMlToken() : null;

      if (platform === "mercadolivre" && (mlbId || mlbuId)) {
        const apiData = await fetchCompetitorViaMlApi({
          mlbId,
          mlbuId,
          permalink: rawUrl || undefined,
          accessToken: token,
        }).catch(() => null);
        if (apiData) {
          scraped = { ...scraped, ...apiData };
        }
      }

      if (!scraped.current_price || !scraped.title) {
        const htmlData = await scrapeCompetitorFromUrl(
          rawUrl,
          externalId || mlbId
        ).catch(() => null);
        if (htmlData) {
          scraped = {
            ...htmlData,
            ...Object.fromEntries(
              Object.entries(scraped).filter(
                ([_, v]) => v !== undefined && v !== null && v !== ""
              )
            ),
          };
        }
      }

      if (scraped.external_id && !externalId) {
        externalId = scraped.external_id;
      }
    }

    if (!externalId) {
      // Gera ID determinístico a partir da URL caso seja Shopee ou URL customizada
      const shopeeMatch = rawUrl.match(/i\.(\d+)\.(\d+)/i);
      if (shopeeMatch) {
        externalId = `SHP-${shopeeMatch[2]}`;
      } else {
        const numMatch = (rawUrl || rawExtId).match(/(\d{7,14})/);
        externalId = numMatch ? `MLB${numMatch[1]}` : `ITEM-${Date.now()}`;
      }
    }

    const title = String(
      body.title ||
        scraped.title ||
        `Anúncio Capturado (${externalId})`
    ).trim();

    const currentPrice = Number(
      body.current_price ?? scraped.current_price ?? 0
    );
    const originalPriceRaw =
      body.original_price !== undefined
        ? body.original_price
        : scraped.original_price ?? null;
    const originalPrice =
      originalPriceRaw && Number(originalPriceRaw) > currentPrice
        ? Number(originalPriceRaw)
        : null;

    let discountPct: number | null =
      body.discount_pct !== undefined && body.discount_pct !== null
        ? Number(body.discount_pct)
        : null;
    if (
      (discountPct === null || discountPct <= 0) &&
      originalPrice &&
      currentPrice > 0 &&
      originalPrice > currentPrice
    ) {
      discountPct = Math.round(
        ((originalPrice - currentPrice) / originalPrice) * 100
      );
    }

    const promoBadge = cleanPromoBadge(
      body.promo_badge ?? scraped.promo_badge ?? null,
      currentPrice,
      originalPrice
    );

    const salesCount = Number(
      body.sales_count_approx ?? scraped.sales_count_approx ?? 0
    );

    const thumbnailUrl =
      body.thumbnail_url || scraped.thumbnail_url || null;

    const permalink =
      normalizeCompetitorPermalink(
        rawUrl || scraped.permalink,
        externalId,
        platform
      ) ||
      rawUrl ||
      `https://produto.mercadolivre.com.br/${externalId}`;

    let listingCreatedAt: string | null =
      body.listing_created_at || scraped.listing_created_at || null;
    if (!listingCreatedAt && platform === "mercadolivre") {
      listingCreatedAt = await refineMlCreationDateFromImage(
        externalId,
        thumbnailUrl
      ).catch(() => estimateMlCreationDate(externalId, thumbnailUrl));
    }

    const shippingType = String(
      body.shipping_type || scraped.shipping_type || "padrao"
    );
    const isFull =
      body.is_full !== undefined
        ? Boolean(body.is_full)
        : shippingType === "ml_full";
    const isFreeShipping =
      body.is_free_shipping !== undefined
        ? Boolean(body.is_free_shipping)
        : currentPrice >= 79 || isFull;

    const listingType =
      body.listing_type || scraped.listing_type || "gold_pro";

    const feeEst = estimateCompetitorFeesAndShipping(
      currentPrice,
      platform,
      listingType,
      externalId,
      isFreeShipping
    );

    const estimatedSaleFee = Number(
      body.estimated_sale_fee ??
        scraped.sale_fee_amount ??
        feeEst.sale_fee_amount ??
        0
    );
    const estimatedShipping = Number(
      body.estimated_shipping ??
        scraped.shipping_cost ??
        feeEst.shipping_cost ??
        0
    );
    const estimatedNet =
      body.estimated_net && Number(body.estimated_net) > 0
        ? Number(body.estimated_net)
        : Math.max(
            0,
            Number(
              (currentPrice - estimatedSaleFee - estimatedShipping).toFixed(2)
            )
          );

    const sellerName = cleanSellerName(
      body.seller_name ||
        body.store_name ||
        scraped.seller_name ||
        "Loja Concorrente"
    );

    const sellerReputation = String(
      body.seller_reputation || scraped.seller_reputation || "platinum"
    );
    const sellerLocation = body.seller_location
      ? String(body.seller_location).trim()
      : null;

    const storeSegment = String(body.store_segment || "Geral");
    const isCatalog = Boolean(
      body.is_catalog ??
        (permalink.includes("/p/MLB") || externalId.startsWith("MLBU"))
    );

    const saved = await upsertSavedOpportunityListing({
      user_id: "00000000-0000-0000-0000-000000000000",
      platform,
      external_id: externalId,
      title,
      current_price: currentPrice,
      original_price: originalPrice,
      discount_pct: discountPct,
      promo_badge: promoBadge,
      sales_count_approx: salesCount,
      listing_created_at: listingCreatedAt,
      shipping_type: shippingType,
      is_full: isFull,
      is_free_shipping: isFreeShipping,
      listing_type: listingType,
      is_catalog: isCatalog,
      estimated_sale_fee: estimatedSaleFee,
      estimated_shipping: estimatedShipping,
      estimated_net: estimatedNet,
      seller_name: sellerName,
      seller_reputation: sellerReputation,
      seller_location: sellerLocation,
      store_segment: storeSegment,
      permalink,
      thumbnail_url: thumbnailUrl,
      rating: Number(body.rating ?? 5.0),
      reviews_count: Number(body.reviews_count ?? 0),
      status: body.status === "created" ? "created" : "pending",
      notes: body.notes ?? null,
      my_created_sku: body.my_created_sku ?? null,
      created_in_store_at:
        body.status === "created" ? new Date().toISOString() : null,
    });

    return NextResponse.json({
      success: true,
      message: "Anúncio salvo na aba 'Anúncios para Analisar & Criar'!",
      data: saved,
    });
  } catch (error: any) {
    console.error("[POST /api/competitors/saved] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao salvar anúncio para análise.",
      },
      { status: 500 }
    );
  }
}

