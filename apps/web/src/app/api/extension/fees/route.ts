import { NextRequest, NextResponse } from "next/server";
import { resolveAnyActiveMlToken } from "@/lib/services/competitorScraper";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveRequestUser } from "@/lib/extension/auth";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Calcula tarifa e frete de fallback quando a API do ML não estiver acessível
 */
function calculateFallbackFees(
  platform: string,
  price: number,
  listingType: string
) {
  if (platform === "shopee") {
    const pct = 20;
    const fixedFee = price >= 8 ? 4.0 : Number((price * 0.5).toFixed(2));
    const saleFee = Number(((price * pct) / 100 + fixedFee).toFixed(2));
    const shippingCost = 0;
    return {
      listing_type_id: "shopee_padrao",
      listing_type_label: "Shopee Frete Grátis",
      sale_fee_amount: saleFee,
      sale_fee_pct: pct,
      fixed_fee: fixedFee,
      shipping_cost: shippingCost,
      net_receivable: Number(Math.max(0, price - saleFee - shippingCost).toFixed(2)),
    };
  }

  const isPremium =
    listingType === "gold_pro" ||
    listingType === "premium" ||
    /premium/i.test(listingType);
  const pct = isPremium ? 16.5 : 11.5;
  const saleFee = Number(((price * pct) / 100).toFixed(2));

  let shippingCost = 19.85;
  if (price < 19) {
    shippingCost = 6.25;
  } else if (price < 49) {
    shippingCost = 6.5;
  } else if (price < 79) {
    shippingCost = 10.25;
  } else {
    shippingCost = 19.85;
  }

  return {
    listing_type_id: isPremium ? "gold_pro" : "gold_special",
    listing_type_label: isPremium ? "Premium" : "Clássico",
    sale_fee_amount: saleFee,
    sale_fee_pct: pct,
    fixed_fee: 0,
    shipping_cost: shippingCost,
    net_receivable: Number(Math.max(0, price - saleFee - shippingCost).toFixed(2)),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = (searchParams.get("platform") || "mercadolivre").toLowerCase();
    const price = parseFloat(searchParams.get("price") || "0");
    const rawListingType = searchParams.get("listing_type") || "gold_special";
    const rawCategoryId = searchParams.get("category_id") || "";
    const breadcrumb = searchParams.get("breadcrumb") || "";
    const title = searchParams.get("title") || "";

    if (!price || isNaN(price) || price <= 0) {
      return NextResponse.json(
        { error: "Preço inválido para cálculo de tarifas." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (platform === "shopee") {
      const fallback = calculateFallbackFees("shopee", price, rawListingType);
      return NextResponse.json(
        { success: true, platform: "shopee", ...fallback, source: "shopee_table" },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const isPremium =
      rawListingType === "gold_pro" ||
      rawListingType === "premium" ||
      /premium/i.test(rawListingType);
    const targetListingTypeId = isPremium ? "gold_pro" : "gold_special";

    const authUser = await resolveRequestUser(req).catch(() => null);
    const accessToken = await resolveAnyActiveMlToken(authUser?.id || null, null);

    if (!accessToken) {
      const fallback = calculateFallbackFees("mercadolivre", price, targetListingTypeId);
      return NextResponse.json(
        { success: true, platform: "mercadolivre", ...fallback, source: "fallback_table" },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    // 1. Resolve seller_id para consulta de frete oficial (shipping_options/free)
    let sellerId: string | null = null;
    try {
      const supabase = createSupabaseAdminClient();
      const { data: row } = await supabase
        .from("marketplace_integrations")
        .select("seller_id")
        .eq("platform", "mercadolivre")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      sellerId = row?.seller_id ? String(row.seller_id) : null;
    } catch {}

    // 2. Resolve category_id (direto ou via domain_discovery usando breadcrumb + título)
    let categoryId = /^MLB\d+$/.test(rawCategoryId.trim()) ? rawCategoryId.trim() : "";
    if (!categoryId && (breadcrumb || title)) {
      try {
        const q = `${breadcrumb} ${title}`.trim().slice(0, 100);
        const ddRes = await fetch(
          `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(q)}`,
          { headers, cache: "no-store" }
        );
        if (ddRes.ok) {
          const ddData = await ddRes.json();
          if (Array.isArray(ddData) && ddData[0]?.category_id) {
            categoryId = ddData[0].category_id;
          }
        }
      } catch {}
    }

    const fallback = calculateFallbackFees("mercadolivre", price, targetListingTypeId);
    let saleFeeAmount = fallback.sale_fee_amount;
    let saleFeePct = fallback.sale_fee_pct;
    let fixedFee = fallback.fixed_fee;
    let listingTypeLabel = fallback.listing_type_label;
    let shippingCost = fallback.shipping_cost;

    // 3. Consulta tarifa oficial (/sites/MLB/listing_prices) e dimensões da categoria em paralelo
    const lpUrl = `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${price}${
      categoryId ? `&category_id=${categoryId}` : ""
    }`;

    const [lpRes, catShipRes] = await Promise.all([
      fetch(lpUrl, { headers, cache: "no-store" }).catch(() => null),
      categoryId
        ? fetch(`https://api.mercadolibre.com/categories/${categoryId}/shipping_preferences`, {
            headers,
            cache: "no-store",
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (lpRes && lpRes.ok) {
      const lpData = await lpRes.json().catch(() => null);
      if (Array.isArray(lpData)) {
        const matchedType =
          lpData.find((x: any) => x.listing_type_id === targetListingTypeId) ||
          lpData.find((x: any) => x.listing_type_id === "gold_special");
        if (matchedType && typeof matchedType.sale_fee_amount === "number") {
          saleFeeAmount = Number(matchedType.sale_fee_amount.toFixed(2));
          saleFeePct =
            matchedType.sale_fee_details?.percentage_fee ??
            Number(((saleFeeAmount / price) * 100).toFixed(1));
          fixedFee = Number(matchedType.sale_fee_details?.fixed_fee || 0);
          listingTypeLabel = matchedType.listing_type_name || listingTypeLabel;
        }
      }
    }

    // 4. Consulta custo oficial de envio (Mercado Envios / shipping_options/free)
    let dims = "10x25x20,500";
    if (catShipRes && catShipRes.ok) {
      const spData = await catShipRes.json().catch(() => null);
      if (spData?.dimensions) {
        const d = spData.dimensions;
        if (d.height && d.width && d.length && d.weight) {
          dims = `${d.height}x${d.width}x${d.length},${d.weight}`;
        }
      }
    }

    if (sellerId) {
      try {
        const freeShipUrl = `https://api.mercadolibre.com/users/${sellerId}/shipping_options/free?item_price=${price}&listing_type_id=${targetListingTypeId}&mode=me2&condition=new&logistic_type=drop_off&dimensions=${dims}`;
        const shipRes = await fetch(freeShipUrl, { headers, cache: "no-store" });
        if (shipRes.ok) {
          const shipData = await shipRes.json();
          const listCost = shipData?.coverage?.all_country?.list_cost;
          if (typeof listCost === "number" && listCost >= 0) {
            shippingCost = Number(listCost.toFixed(2));
          }
        }
      } catch {}
    }

    const netReceivable = Number(Math.max(0, price - saleFeeAmount - shippingCost).toFixed(2));

    return NextResponse.json(
      {
        success: true,
        platform: "mercadolivre",
        category_id: categoryId || null,
        listing_type_id: targetListingTypeId,
        listing_type_label: listingTypeLabel,
        sale_fee_amount: saleFeeAmount,
        sale_fee_pct: saleFeePct,
        fixed_fee: fixedFee,
        shipping_cost: shippingCost,
        net_receivable: netReceivable,
        source: "ml_official_api",
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Falha ao calcular tarifas e frete." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

