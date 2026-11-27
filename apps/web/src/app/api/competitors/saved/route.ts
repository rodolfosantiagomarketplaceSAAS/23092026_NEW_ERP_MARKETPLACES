import { NextRequest, NextResponse } from "next/server";
import { resolveUnifiedAuth, type AuthContext } from "@/lib/auth/context";
import { parseSafeMarketplaceUrl } from "@/lib/security/url-validator";
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

async function resolveMlSellerRealLocation(
  ctx: AuthContext,
  sellerIdRaw?: string | number | null,
  sellerStoreUrlRaw?: string | null,
  sellerNameRaw?: string | null
): Promise<string | null> {
  try {
    let sellerId = String(sellerIdRaw || "").trim();
    if (!/^\d{4,15}$/.test(sellerId)) {
      sellerId = "";
    }

    if (!sellerId && (sellerStoreUrlRaw || sellerNameRaw)) {
      const safeStoreUrl = parseSafeMarketplaceUrl(sellerStoreUrlRaw, {
        platform: "mercadolivre",
      });
      const storeUrl = safeStoreUrl
        ? safeStoreUrl.toString()
        : sellerNameRaw
        ? `https://www.mercadolivre.com.br/pagina/${String(sellerNameRaw)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "")}`
        : "";
      if (storeUrl) {
        const res = await fetch(storeUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
          },
          redirect: "manual",
          cache: "no-store",
        }).catch(() => null);
        if (res && res.ok) {
          const html = await res.text();
          const m =
            html.match(/"seller_id"\s*:\s*"?(\d{5,15})"?/i) ||
            html.match(/"owner_id"\s*:\s*"?(\d{5,15})"?/i) ||
            html.match(/_CustId_(\d{5,15})/i);
          if (m && m[1]) sellerId = m[1];
        }
      }
    }

    if (!sellerId) return null;
    const token = await resolveAnyActiveMlToken(ctx.userId, ctx.organizationId);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const userRes = await fetch(
      `https://api.mercadolibre.com/users/${sellerId}`,
      { headers, cache: "no-store" }
    ).catch(() => null);
    if (userRes && userRes.ok) {
      const uData = await userRes.json().catch(() => null);
      const city = uData?.address?.city;
      const stateRaw = uData?.address?.state || "";
      const state = String(stateRaw).replace(/^BR-/, "").trim();
      if (city && state) return `${city} - ${state}`;
      if (city) return String(city);
    }
  } catch {}
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUnifiedAuth(request);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status"); // "all" | "pending" | "created"
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    const allItems = await listSavedOpportunityListings(ctx.userId);

    // Performance: limita auto-heal a no máximo 3 itens pendentes por chamada GET (elimina gargalo N+1!)
    const candidatesForHeal = allItems
      .filter(
        (item) =>
          item.platform === "mercadolivre" &&
          (!item.seller_location ||
            item.seller_location.toLowerCase().includes("passo fundo") ||
            !item.listing_created_at)
      )
      .slice(0, 3);

    await Promise.all(
      candidatesForHeal.map(async (item) => {
        let changed = false;
        if (
          !item.seller_location ||
          item.seller_location.toLowerCase().includes("passo fundo")
        ) {
          const realLoc = await resolveMlSellerRealLocation(
            ctx,
            null,
            null,
            item.seller_name
          );
          if (realLoc && realLoc !== item.seller_location) {
            item.seller_location = realLoc;
            changed = true;
          }
        }

        if (!item.listing_created_at && /^MLB\d{9,12}$/i.test(item.external_id)) {
          const officialDate = await refineMlCreationDateFromImage(
            item.external_id,
            item.thumbnail_url
          ).catch(() => null);
          if (officialDate && officialDate !== item.listing_created_at) {
            item.listing_created_at = officialDate;
            changed = true;
          }
        }

        if (changed) {
          await upsertSavedOpportunityListing({
            ...item,
            user_id: ctx.userId,
            seller_location: item.seller_location,
            listing_created_at: item.listing_created_at,
          }).catch(() => null);
        }
      })
    );

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

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveUnifiedAuth(request);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json();

    const rawUrlInput = String(body.url || body.permalink || "").trim();
    const safeParsedUrl = rawUrlInput ? parseSafeMarketplaceUrl(rawUrlInput) : null;
    const rawUrl = safeParsedUrl ? safeParsedUrl.toString() : "";
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
        platform === "mercadolivre"
          ? await resolveAnyActiveMlToken(ctx.userId, ctx.organizationId)
          : null;

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
    if (platform === "mercadolivre") {
      const officialDate = await refineMlCreationDateFromImage(
        externalId,
        thumbnailUrl
      ).catch(() => estimateMlCreationDate(externalId, thumbnailUrl));
      if (officialDate) {
        listingCreatedAt = officialDate;
      }
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
    let sellerLocation = body.seller_location
      ? String(body.seller_location).trim()
      : null;
    if (
      platform === "mercadolivre" &&
      (!sellerLocation || sellerLocation.toLowerCase().includes("passo fundo"))
    ) {
      const resolvedLoc = await resolveMlSellerRealLocation(
        ctx,
        body.seller_id,
        body.seller_store_url,
        sellerName
      );
      if (resolvedLoc) {
        sellerLocation = resolvedLoc;
      } else if (sellerLocation?.toLowerCase().includes("passo fundo")) {
        sellerLocation = null;
      }
    }

    const storeSegment = String(body.store_segment || "Geral");
    const isCatalog = Boolean(
      body.is_catalog ??
        (permalink.includes("/p/MLB") || externalId.startsWith("MLBU"))
    );

    const saved = await upsertSavedOpportunityListing({
      user_id: ctx.userId,
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

