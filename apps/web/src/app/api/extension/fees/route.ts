import { NextRequest, NextResponse } from "next/server";
import {
  refineMlCreationDateFromImage,
  resolveAnyActiveMlToken,
} from "@/lib/services/competitorScraper";
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
 * Estima o peso em gramas pelo título quando a ficha técnica não informou explicitamente
 */
function inferWeightGramsFromTitle(title: string): number | null {
  if (!title) return null;
  const t = title.toLowerCase();

  // Películas, PPF, adesivos, capinhas -> até 300g
  if (
    /\b(pel[íi]cula|ppf|adesivo|envelopamento|fita\s+adesiva|capinha|protetor\s+de\s+tela|insulfilm)\b/i.test(
      t
    )
  ) {
    return 250;
  }

  // Peso explícito no título (ex: "5kg", "3,5 kg", "800g")
  const explicitKg = t.match(/\b(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?)\b/i);
  if (explicitKg) {
    const val = parseFloat(explicitKg[1].replace(",", "."));
    if (!isNaN(val) && val > 0 && val <= 100) {
      return Math.round(val * 1000);
    }
  }
  const explicitG = t.match(/\b(\d{2,5})\s*(?:g|gr|gramas?)\b/i);
  if (explicitG) {
    const val = parseInt(explicitG[1], 10);
    if (!isNaN(val) && val >= 20 && val <= 50000) {
      return val;
    }
  }

  // Transformadores e Autotransformadores por potência (VA / Watts)
  if (/\b(transformador|autotransformador|auto\s*transformador)\b/i.test(t)) {
    const vaMatch = t.match(/\b(\d{3,5})\s*(?:va|w|watts?)\b/i);
    if (vaMatch) {
      const va = parseInt(vaMatch[1], 10);
      if (va <= 300) return 900;
      if (va <= 500) return 1350;
      if (va <= 750) return 1750;
      if (va <= 1050) return 2250;
      if (va <= 1500) return 2900;
      if (va <= 2000) return 3800; // Transformador 2000VA (~3,8 kg -> faixa 3 a 5 kg)
      if (va <= 3000) return 5200; // Transformador 3000VA (~5,2 kg)
      if (va <= 4000) return 6800;
      if (va <= 5000) return 8500;
      if (va <= 7000) return 11500;
      return 14500;
    }
    return 3500;
  }

  return null;
}

/**
 * Tabela Oficial Mercado Envios (50% de desconto Líder / Reputação Verde)
 * Cruzamento exato de Faixa de Peso (g) × Faixa de Preço (R$)
 */
function estimateMlShippingByPriceAndWeight(
  price: number,
  weightGrams = 250,
  isFreeShipping?: boolean | null
): number {
  if (!price || price <= 0) return 0;
  // Abaixo de R$ 79 o frete só é pago pelo vendedor se ele oferecer frete grátis explicitamente
  if (price < 79 && isFreeShipping !== true) {
    return 0;
  }

  const w = Math.max(50, weightGrams || 250);

  // Índices de preço: 0 (<79 c/ frete grátis), 1 (79-99.99), 2 (100-119.99), 3 (120-149.99), 4 (150-199.99), 5 (200+)
  const pIdx =
    price < 79
      ? 0
      : price < 100
      ? 1
      : price < 120
      ? 2
      : price < 150
      ? 3
      : price < 200
      ? 4
      : 5;

  // Tabela [peso][faixa_preco] com 50% de desconto Líder/Verde (Mercado Envios 2025/2026)
  const table: { maxWeight: number; costs: [number, number, number, number, number, number] }[] = [
    { maxWeight: 300, costs: [12.45, 13.65, 16.85, 18.65, 20.45, 22.45] },
    { maxWeight: 500, costs: [13.45, 14.65, 17.85, 19.95, 21.95, 23.95] },
    { maxWeight: 1000, costs: [14.25, 15.45, 18.85, 21.05, 23.15, 25.45] },
    { maxWeight: 2000, costs: [15.25, 16.45, 19.95, 22.45, 24.65, 26.95] },
    { maxWeight: 3000, costs: [16.45, 17.65, 21.05, 23.65, 25.95, 28.45] },
    { maxWeight: 4000, costs: [17.95, 19.25, 22.85, 25.65, 28.25, 30.95] },
    { maxWeight: 5000, costs: [19.45, 20.85, 24.45, 27.45, 30.25, 33.45] },
    { maxWeight: 9000, costs: [28.95, 31.45, 36.95, 41.45, 45.65, 49.95] },
    { maxWeight: 13000, costs: [42.95, 46.95, 54.95, 61.95, 67.95, 74.95] },
    { maxWeight: 999999, costs: [52.95, 58.95, 68.95, 76.95, 84.95, 92.95] },
  ];

  for (const row of table) {
    if (w <= row.maxWeight) {
      return row.costs[pIdx];
    }
  }
  return table[table.length - 1].costs[pIdx];
}

function calculateFallbackFees(
  platform: string,
  price: number,
  listingType: string,
  weightGrams = 250
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
      billable_weight: weightGrams,
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
  const shippingCost = estimateMlShippingByPriceAndWeight(price, weightGrams);

  return {
    listing_type_id: isPremium ? "gold_pro" : "gold_special",
    listing_type_label: isPremium ? "Premium" : "Clássico",
    sale_fee_amount: saleFee,
    sale_fee_pct: pct,
    fixed_fee: fixedFee,
    shipping_cost: shippingCost,
    billable_weight: weightGrams,
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
    const rawWeightGrams = parseInt(searchParams.get("weight_grams") || "0", 10);
    const rawSellerId = searchParams.get("seller_id") || "";
    const thumbnailUrl = searchParams.get("thumbnail_url") || "";

    if (!price || isNaN(price) || price <= 0) {
      return NextResponse.json(
        { error: "Preço inválido para cálculo de tarifas." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const inferredWeight =
      rawWeightGrams > 0
        ? rawWeightGrams
        : inferWeightGramsFromTitle(title) || 250;

    if (platform === "shopee") {
      const fallback = calculateFallbackFees("shopee", price, rawListingType, inferredWeight);
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

    // Normaliza item_id (ex: MLB-1263554412 -> MLB1263554412)
    const itemMatch = rawItemId.match(/MLB-?(\d+)/i);
    const normalizedItemId = itemMatch ? `MLB${itemMatch[1]}` : "";

    // Refina data de criação pela imagem no CDN mlstatic.com em paralelo
    const refinedDatePromise = thumbnailUrl
      ? refineMlCreationDateFromImage(normalizedItemId, thumbnailUrl).catch(() => null)
      : Promise.resolve(null);

    const authUser = await resolveRequestUser(req).catch(() => null);
    const accessToken = await resolveAnyActiveMlToken(authUser?.id || null, null);

    if (!accessToken) {
      const fallback = calculateFallbackFees(
        "mercadolivre",
        price,
        targetListingTypeId,
        inferredWeight
      );
      const listingCreatedAt = await refinedDatePromise;
      return NextResponse.json(
        {
          success: true,
          platform: "mercadolivre",
          ...fallback,
          listing_created_at: listingCreatedAt,
          source: "fallback_table",
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    // 1. Resolve seller_id da conta integrada para consulta de frete oficial (shipping_options/free)
    let mySellerId: string | null = null;
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
      mySellerId = row?.seller_id ? String(row.seller_id) : null;
    } catch {}

    // 2. Consulta dados do item (/items/MLB...) e/ou vendedor concorrente (/users/...) para obter:
    //    - category_id real
    //    - seller_address (Localização do Concorrente: Cidade - UF)
    //    - date_created / start_time (Data de Criação)
    let categoryId = /^MLB\d+$/.test(rawCategoryId.trim()) ? rawCategoryId.trim() : "";
    let sellerLocation: string | null = null;
    let apiCreatedAt: string | null = null;
    let competitorSellerId = rawSellerId || null;

    if (normalizedItemId) {
      try {
        const itemRes = await fetch(
          `https://api.mercadolibre.com/items/${normalizedItemId}`,
          { headers, cache: "no-store" }
        ).catch(() => null);
        if (itemRes && itemRes.ok) {
          const itemData = await itemRes.json().catch(() => null);
          if (itemData) {
            if (itemData.category_id && !categoryId) {
              categoryId = String(itemData.category_id);
            }
            if (itemData.seller_id && !competitorSellerId) {
              competitorSellerId = String(itemData.seller_id);
            }
            if (itemData.date_created || itemData.start_time) {
              apiCreatedAt = itemData.date_created || itemData.start_time;
            }
            const city = itemData.seller_address?.city?.name;
            const stateId = itemData.seller_address?.state?.id;
            const stateName = itemData.seller_address?.state?.name;
            if (city) {
              const uf = stateId
                ? String(stateId).replace(/^BR-/, "")
                : stateName || "";
              sellerLocation = uf ? `${city} - ${uf}` : city;
            }
          }
        }
      } catch {}
    }

    // Se ainda não temos a localização do concorrente e temos o seller_id dele, consulta /users/{competitorSellerId}
    if (!sellerLocation && competitorSellerId) {
      try {
        const userRes = await fetch(
          `https://api.mercadolibre.com/users/${competitorSellerId}`,
          { headers, cache: "no-store" }
        ).catch(() => null);
        if (userRes && userRes.ok) {
          const uData = await userRes.json().catch(() => null);
          const city = uData?.address?.city;
          const state = uData?.address?.state;
          if (city) {
            const uf = state ? String(state).replace(/^BR-/, "") : "";
            sellerLocation = uf ? `${city} - ${uf}` : city;
          }
        }
      } catch {}
    }

    // 3. Resolve category_id via domain_discovery se ainda não identificado
    if (!categoryId && (title || breadcrumb)) {
      try {
        const q = (title || breadcrumb).trim().slice(0, 100);
        const ddUrl = `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(
          q
        )}`;
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

    const fallback = calculateFallbackFees(
      "mercadolivre",
      price,
      targetListingTypeId,
      inferredWeight
    );
    let saleFeeAmount = fallback.sale_fee_amount;
    let saleFeePct = fallback.sale_fee_pct;
    let fixedFee = fallback.fixed_fee;
    let listingTypeLabel = fallback.listing_type_label;
    let shippingCost = fallback.shipping_cost;
    let shippingSource = fallback.shipping_source;
    let billableWeight: number | null = inferredWeight;

    // Apenas películas/PPF/adesivos/capinhas têm trava de peso <= 300g
    const isUltraLightFilm =
      /\b(pel[íi]cula|ppf|adesivo|envelopamento|fita\s+adesiva|capinha|protetor\s+de\s+tela|insulfilm)\b/i.test(
        title
      ) && rawWeightGrams <= 300;

    // 4. Consulta tarifa oficial (/sites/MLB/listing_prices) e frete exato do item (?item_id=MLB...) em paralelo
    const lpUrl = `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${price}${
      categoryId ? `&category_id=${categoryId}` : ""
    }`;

    const exactItemShipPromise =
      mySellerId && normalizedItemId
        ? fetch(
            `https://api.mercadolibre.com/users/${mySellerId}/shipping_options/free?item_id=${normalizedItemId}`,
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

    // 5. Verifica se o frete exato por item_id retornou com sucesso
    let resolvedExactShipping = false;
    if (exactShipRes && exactShipRes.ok) {
      const shipData = await exactShipRes.json().catch(() => null);
      const listCost = shipData?.coverage?.all_country?.list_cost;
      const itemBillableWeight =
        shipData?.coverage?.all_country?.billable_weight ?? null;

      if (
        typeof listCost === "number" &&
        listCost >= 0 &&
        (!isUltraLightFilm || !itemBillableWeight || itemBillableWeight <= 300)
      ) {
        shippingCost = Number(listCost.toFixed(2));
        billableWeight = itemBillableWeight || inferredWeight;
        shippingSource = "ml_item_id";
        resolvedExactShipping = true;
      }
    }

    // 6. Se o item_id não retornou frete direto, usa as dimensões/peso reais do produto ou da categoria
    if (!resolvedExactShipping && mySellerId && price >= 79) {
      try {
        let targetWeight = isUltraLightFilm ? 250 : inferredWeight;
        let dims = `10x15x20,${targetWeight}`;

        if (!isUltraLightFilm && rawWeightGrams <= 0 && categoryId) {
          const catShipRes = await fetch(
            `https://api.mercadolibre.com/categories/${categoryId}/shipping_preferences`,
            { headers, cache: "no-store" }
          ).catch(() => null);
          if (catShipRes && catShipRes.ok) {
            const spData = await catShipRes.json().catch(() => null);
            const d = spData?.dimensions;
            if (d && d.height && d.width && d.length && d.weight) {
              // Se o título indicou peso maior (ex: Transformador 2000VA = 3800g), usa o maior entre categoria e inferido
              const w = Math.max(Number(d.weight) || 250, targetWeight);
              dims = `${d.height}x${d.width}x${d.length},${w}`;
              targetWeight = w;
            }
          }
        }

        const freeShipUrl = `https://api.mercadolibre.com/users/${mySellerId}/shipping_options/free?item_price=${price}&listing_type_id=${targetListingTypeId}&mode=me2&condition=new&logistic_type=drop_off&dimensions=${dims}`;
        const shipRes = await fetch(freeShipUrl, { headers, cache: "no-store" });
        if (shipRes.ok) {
          const shipData = await shipRes.json();
          const listCost = shipData?.coverage?.all_country?.list_cost;
          if (typeof listCost === "number" && listCost >= 0) {
            shippingCost = Number(listCost.toFixed(2));
            billableWeight =
              shipData?.coverage?.all_country?.billable_weight ?? targetWeight;
            shippingSource = "ml_dimensions";
            resolvedExactShipping = true;
          }
        }
      } catch {}
    }

    // Se a API do ML falhou (ex: token sem permissão para shipping_options de terceiros),
    // garante que o fallback usa o peso real (ex: 3800g para Transformador 2000VA -> R$ 22,85 em vez de R$ 14,95!)
    if (!resolvedExactShipping) {
      shippingCost = estimateMlShippingByPriceAndWeight(price, billableWeight || inferredWeight);
    }

    const refinedImgDate = await refinedDatePromise;
    const finalCreatedAt = apiCreatedAt || refinedImgDate || null;
    const netReceivable = Number(
      Math.max(0, price - saleFeeAmount - shippingCost).toFixed(2)
    );

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
        seller_location: sellerLocation,
        listing_created_at: finalCreatedAt,
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
