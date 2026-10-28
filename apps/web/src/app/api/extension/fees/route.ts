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
 * Calcula o frete padrão do Mercado Envios (faixa até 300g com 50% desc. Líder/Verde) por faixa de preço
 */
function estimateMlShippingByPrice(price: number): number {
  if (price < 19) return 5.65;
  if (price < 49) return 6.85;
  if (price < 79) return 10.25;
  if (price < 100) return 13.65;
  if (price < 120) return 16.85;
  if (price < 150) return 18.65;
  if (price < 200) return 20.45;
  return 22.45;
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
      shipping_source: "shopee_table",
      net_receivable: Number(Math.max(0, price - saleFee - shippingCost).toFixed(2)),
    };
  }

  const isPremium =
    listingType === "gold_pro" ||
    listingType === "premium" ||
    /premium/i.test(listingType);
  const pct = isPremium ? 17 : 12;
  const fixedFee = price < 79 ? 6.0 : 0;
  const saleFee = Number(((price * pct) / 100 + fixedFee).toFixed(2));
  const shippingCost = price < 79 ? 0 : estimateMlShippingByPrice(price);

  return {
    listing_type_id: isPremium ? "gold_pro" : "gold_special",
    listing_type_label: isPremium ? "Premium" : "Clássico",
    sale_fee_amount: saleFee,
    sale_fee_pct: pct,
    fixed_fee: fixedFee,
    shipping_cost: shippingCost,
    shipping_source: "fallback_table",
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
    const rawItemId = searchParams.get("item_id") || "";
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

    // Normaliza item_id (ex: MLB-1263554412 -> MLB1263554412)
    const itemMatch = rawItemId.match(/MLB-?(\d+)/i);
    const normalizedItemId = itemMatch ? `MLB${itemMatch[1]}` : "";

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

    // 2. Resolve category_id (direto ou via domain_discovery usando título/breadcrumb)
    let categoryId = /^MLB\d+$/.test(rawCategoryId.trim()) ? rawCategoryId.trim() : "";
    if (!categoryId && (title || breadcrumb)) {
      try {
        const q = (title || breadcrumb).trim().slice(0, 100);
        const ddUrl = `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(q)}`;
        let ddRes = await fetch(ddUrl, { headers, cache: "no-store" });
        if (!ddRes.ok) {
          ddRes = await fetch(ddUrl, { cache: "no-store" });
        }
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
    let shippingSource = fallback.shipping_source;
    let billableWeight: number | null = null;

    const isExplicitlyHeavy =
      /\b(kit\s+motor|motor\s+(?:deslizante|basculante|pivotante)|automatizador\s+completo|bateria\s+automotiva|pneu|roda\s+aro)\b/i.test(
        title
      ) &&
      !/\b(placa|central|controle|sensor|pe[çc]a|engrenagem|pel[íi]cula|ppf|adesivo|capa|capinha|fita|filme)\b/i.test(
        title
      );

    // 3. Consulta tarifa oficial (/sites/MLB/listing_prices) e frete exato do item (?item_id=MLB...) em paralelo
    const lpUrl = `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${price}${
      categoryId ? `&category_id=${categoryId}` : ""
    }`;

    const exactItemShipPromise =
      sellerId && normalizedItemId
        ? fetch(
            `https://api.mercadolibre.com/users/${sellerId}/shipping_options/free?item_id=${normalizedItemId}`,
            { headers, cache: "no-store" }
          ).catch(() => null)
        : Promise.resolve(null);

    const [lpRes, exactShipRes] = await Promise.all([
      fetch(lpUrl, { headers, cache: "no-store" }).catch(() => null),
      exactItemShipPromise,
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

    // 4. Verifica se o frete exato por item_id retornou com sucesso (e se não usou peso inflado > 300g para item leve)
    let resolvedExactShipping = false;
    if (exactShipRes && exactShipRes.ok) {
      const shipData = await exactShipRes.json().catch(() => null);
      const listCost = shipData?.coverage?.all_country?.list_cost;
      const itemBillableWeight = shipData?.coverage?.all_country?.billable_weight ?? null;
      if (
        typeof listCost === "number" &&
        listCost >= 0 &&
        (isExplicitlyHeavy || !itemBillableWeight || itemBillableWeight <= 300)
      ) {
        shippingCost = Number(listCost.toFixed(2));
        billableWeight = itemBillableWeight;
        shippingSource = "ml_item_id";
        resolvedExactShipping = true;
      }
    }

    // 5. Fallback por dimensões se item_id não for um anúncio direto ou tiver peso de categoria inflado (> 300g)
    if (!resolvedExactShipping && sellerId) {
      try {
        let dims = "5x10x15,250";
        if (categoryId && isExplicitlyHeavy) {
          const catShipRes = await fetch(
            `https://api.mercadolibre.com/categories/${categoryId}/shipping_preferences`,
            { headers, cache: "no-store" }
          ).catch(() => null);
          if (catShipRes && catShipRes.ok) {
            const spData = await catShipRes.json().catch(() => null);
            const d = spData?.dimensions;
            if (d && d.height && d.width && d.length && d.weight) {
              dims = `${d.height}x${d.width}x${d.length},${d.weight}`;
            }
          }
        }

        const freeShipUrl = `https://api.mercadolibre.com/users/${sellerId}/shipping_options/free?item_price=${price}&listing_type_id=${targetListingTypeId}&mode=me2&condition=new&logistic_type=drop_off&dimensions=${dims}`;
        const shipRes = await fetch(freeShipUrl, { headers, cache: "no-store" });
        if (shipRes.ok) {
          const shipData = await shipRes.json();
          const listCost = shipData?.coverage?.all_country?.list_cost;
          if (typeof listCost === "number" && listCost >= 0) {
            shippingCost = Number(listCost.toFixed(2));
            billableWeight = shipData?.coverage?.all_country?.billable_weight ?? 250;
            shippingSource = "ml_dimensions";
          }
        }
      } catch {}
    }

    const netReceivable = Number(Math.max(0, price - saleFeeAmount - shippingCost).toFixed(2));

    return NextResponse.json(
      {
        success: true,
        platform: "mercadolivre",
        item_id: normalizedItemId || null,
        category_id: categoryId || null,
        listing_type_id: targetListingTypeId,
        listing_type_label: listingTypeLabel,
        sale_fee_amount: saleFeeAmount,
        sale_fee_pct: saleFeePct,
        fixed_fee: fixedFee,
        shipping_cost: shippingCost,
        billable_weight: billableWeight,
        shipping_source: shippingSource,
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
