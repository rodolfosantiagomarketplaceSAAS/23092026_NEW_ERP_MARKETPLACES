import type {
  MlCatalogKpis,
  MlFamilyDbRow,
  MlSaleOptionDbRow,
  MlVariationDbRow,
  MlVariationMlbRef,
} from "@/types/ml-catalog";
import type {
  GroupedFamilyProduct,
  GroupedVariationNode,
  SellingOptionItem,
} from "@/lib/catalogo/mlGroupingEngine";
import { formatMlbDigits, getChannelLabel, isPremiumListingType, round2 } from "@/lib/mercadolivre/catalog-sync";

function sortDbSaleOptions(options: MlSaleOptionDbRow[]): MlSaleOptionDbRow[] {
  return [...options].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const aPremium = isPremiumListingType(a.listing_type_id) ? 1 : 0;
    const bPremium = isPremiumListingType(b.listing_type_id) ? 1 : 0;
    if (aPremium !== bPremium) return aPremium - bPremium;

    const aCatalog = a.catalog_listing ? 1 : 0;
    const bCatalog = b.catalog_listing ? 1 : 0;
    if (aCatalog !== bCatalog) return aCatalog - bCatalog;

    const aPrice = Number(a.promo_price ?? a.base_price ?? 0);
    const bPrice = Number(b.promo_price ?? b.base_price ?? 0);
    if (aPrice !== bPrice) return aPrice - bPrice;

    return a.item_id.localeCompare(b.item_id);
  });
}

/**
 * Monta a estrutura hierárquica de 3 níveis diretamente a partir das tabelas normalizadas
 * (`ml_families`, `ml_variations`, `ml_sale_options`), SEM nenhuma métrica inventada/seed
 * e garantindo que o estoque da família some APENAS do Nível 2 (`ml_variations.available_quantity`).
 */
export function buildHierarchyFromNormalizedTables(
  families: MlFamilyDbRow[],
  variations: MlVariationDbRow[],
  saleOptions: MlSaleOptionDbRow[]
): { families: GroupedFamilyProduct[]; kpis: MlCatalogKpis } {
  const optionsByVariation = new Map<string, MlSaleOptionDbRow[]>();
  for (const opt of saleOptions) {
    if (opt.status === "closed") continue;
    const list = optionsByVariation.get(opt.user_product_id) || [];
    list.push(opt);
    optionsByVariation.set(opt.user_product_id, list);
  }

  const variationsByFamily = new Map<string, MlVariationDbRow[]>();
  for (const variation of variations) {
    const list = variationsByFamily.get(variation.family_id) || [];
    list.push(variation);
    variationsByFamily.set(variation.family_id, list);
  }

  const familyProducts: GroupedFamilyProduct[] = [];

  for (const family of families) {
    if (family.status === "closed") continue;

    const rawVars = variationsByFamily.get(family.family_id) || [];
    const variationNodes: GroupedVariationNode[] = [];

    for (const variation of rawVars) {
      const sortedOpts = sortDbSaleOptions(
        optionsByVariation.get(variation.user_product_id) || []
      );
      if (sortedOpts.length === 0) continue;

      const sellingOptions: SellingOptionItem[] = sortedOpts.map((opt) => {
        const isPremium = isPremiumListingType(opt.listing_type_id);
        const basePrice = Number(opt.base_price || 0);
        const promoPrice =
          opt.promo_price !== null && opt.promo_price !== undefined
            ? Number(opt.promo_price)
            : null;
        const hasPromo = promoPrice !== null && promoPrice > 0 && promoPrice < basePrice;
        const activePrice = hasPromo && promoPrice !== null ? promoPrice : basePrice;
        const discountPct =
          hasPromo && basePrice > 0
            ? Math.round(((basePrice - activePrice) / basePrice) * 100)
            : null;

        const visits7d = Number(opt.visits_7d || 0);
        const sales7d = Number(opt.sales_7d || 0);
        const sales30d = Number(opt.sales_30d || 0);
        const conversionRate =
          opt.conversion_rate_7d !== null && opt.conversion_rate_7d !== undefined
            ? Number(opt.conversion_rate_7d)
            : visits7d > 0
            ? round2((sales7d / visits7d) * 100)
            : 0;

        const expectedWeekly = sales30d / 4.28;
        let trend: "up" | "down" | "stable" | "neutral" = "neutral";
        if (sales7d > 0 || sales30d > 0) {
          if (sales7d > expectedWeekly * 1.15) trend = "up";
          else if (sales7d < expectedWeekly * 0.85) trend = "down";
          else trend = "stable";
        }

        return {
          optionKey: opt.item_id,
          listingId: opt.item_id,
          externalId: opt.item_id,
          cleanMlbDigits: formatMlbDigits(opt.item_id),
          permalink: opt.permalink,
          channelType: isPremium ? "premium" : "classic",
          channelLabel: getChannelLabel(opt.listing_type_id),
          isCatalog: Boolean(opt.catalog_listing),
          price: activePrice,
          basePrice,
          originalPrice: hasPromo ? basePrice : null,
          hasPromo,
          discountPct,
          hasWholesale: Boolean(opt.has_wholesale),
          saleFeeAmount: Number(opt.sale_fee_amount || 0),
          saleFeePct: Number(opt.sale_fee_pct || 0),
          shippingCost: Number(opt.shipping_cost_amount || 0),
          freeShipping: Boolean(opt.free_shipping),
          shippingModeLabel:
            opt.shipping_mode_label ||
            (opt.free_shipping ? "Frete grátis" : "Envio por conta do comprador"),
          shippingType: opt.shipping_logistic_type || "padrao",
          netAmount: Number(opt.net_receive_amount || 0),
          stock: Number(variation.available_quantity || 0),
          sold: Number(opt.sold_quantity || 0),
          visits: visits7d,
          sales7d,
          sales30d,
          conversionRate,
          trend,
          trendPct: 0,
          sparkline: [],
          qualityScore:
            opt.health_score !== null && opt.health_score !== undefined
              ? Number(opt.health_score)
              : null,
          objectivesCount: Number(opt.pending_goals_count || 0),
          recommendationTitle: opt.recommendation_title || null,
          recommendationAction: opt.recommendation_action || null,
          status: opt.status,
          subStatus: opt.sub_status || null,
        };
      });

      // Alinhamento estrito 1:1 com a ordem das sellingOptions (resolve inversão Clássico/Premium)
      const mlbIds = sellingOptions.map((o) => ({
        externalId: o.externalId,
        cleanDigits: o.cleanMlbDigits,
        permalink: o.permalink,
        channelLabel: o.channelLabel,
        isCatalog: o.isCatalog,
        status: o.status,
      }));

      // Fallback para mlbs_list caso necessário (garantindo consistência de tipo)
      const _storedRefs: MlVariationMlbRef[] = Array.isArray(variation.mlbs_list)
        ? variation.mlbs_list
        : [];
      void _storedRefs;

      const totalSold = sellingOptions.reduce((acc, o) => acc + o.sold, 0);
      const totalVisits = sellingOptions.reduce((acc, o) => acc + o.visits, 0);
      const totalSales7d = sellingOptions.reduce((acc, o) => acc + o.sales7d, 0);
      const totalSales30d = sellingOptions.reduce((acc, o) => acc + o.sales30d, 0);

      variationNodes.push({
        variationKey: variation.user_product_id,
        userProductId: variation.user_product_id,
        variationName: variation.variation_name,
        sku: variation.sku,
        thumbnail: variation.thumbnail_url || null,
        stock: Number(variation.available_quantity || 0),
        totalSold,
        totalVisits,
        totalSales7d,
        totalSales30d,
        mlbIds,
        sellingOptions,
      });
    }

    if (variationNodes.length === 0) continue;

    variationNodes.sort((a, b) => {
      if (b.totalSales7d !== a.totalSales7d) return b.totalSales7d - a.totalSales7d;
      if (b.stock !== a.stock) return b.stock - a.stock;
      return a.variationName.localeCompare(b.variationName);
    });

    const allOptions = variationNodes.flatMap((v) => v.sellingOptions);
    // REGRA CRÍTICA: Estoque total da família soma APENAS o Nível 2 (ml_variations)
    const totalStock = variationNodes.reduce((acc, v) => acc + v.stock, 0);
    const totalSold = allOptions.reduce((acc, o) => acc + o.sold, 0);
    const totalVisits = allOptions.reduce((acc, o) => acc + o.visits, 0);
    const totalSales7d = allOptions.reduce((acc, o) => acc + o.sales7d, 0);
    const totalSales30d = allOptions.reduce((acc, o) => acc + o.sales30d, 0);

    const basePrices = allOptions.map((o) => o.basePrice).filter((p) => p > 0);
    const currentPrices = allOptions.map((o) => o.price).filter((p) => p > 0);
    const promoOptions = allOptions.filter((o) => o.hasPromo);
    const promoPrices = promoOptions.map((o) => o.price).filter((p) => p > 0);
    const netAmounts = allOptions.map((o) => o.netAmount);

    const minBasePrice = basePrices.length > 0 ? Math.min(...basePrices) : 0;
    const maxBasePrice = basePrices.length > 0 ? Math.max(...basePrices) : 0;
    const minPrice = currentPrices.length > 0 ? Math.min(...currentPrices) : 0;
    const maxPrice = currentPrices.length > 0 ? Math.max(...currentPrices) : 0;
    const minPromoPrice = promoPrices.length > 0 ? Math.min(...promoPrices) : minPrice;
    const maxPromoPrice = promoPrices.length > 0 ? Math.max(...promoPrices) : maxPrice;
    const minNetAmount = netAmounts.length > 0 ? Math.min(...netAmounts) : 0;
    const maxNetAmount = netAmounts.length > 0 ? Math.max(...netAmounts) : 0;

    const scoredOptions = allOptions.filter(
      (o): o is SellingOptionItem & { qualityScore: number } =>
        typeof o.qualityScore === "number"
    );
    const avgQualityScore =
      scoredOptions.length > 0
        ? Math.round(
            scoredOptions.reduce((acc, o) => acc + o.qualityScore, 0) / scoredOptions.length
          )
        : null;

    const totalObjectives = allOptions.reduce((acc, o) => acc + o.objectivesCount, 0);
    const inactiveVariationsCount = variationNodes.filter(
      (v) => v.stock === 0 || v.sellingOptions.every((o) => o.status !== "active")
    ).length;

    const conversionRate =
      totalVisits > 0 ? round2((totalSales7d / totalVisits) * 100) : 0;

    const expectedWeekly = totalSales30d / 4.28;
    let trend: "up" | "down" | "stable" | "neutral" = "neutral";
    if (totalSales7d > 0 || totalSales30d > 0) {
      if (totalSales7d > expectedWeekly * 1.15) trend = "up";
      else if (totalSales7d < expectedWeekly * 0.85) trend = "down";
      else trend = "stable";
    }

    const distinctThumbs = Array.from(
      new Set(
        [
          family.thumbnail_url,
          ...variationNodes.map((v) => v.thumbnail),
        ].filter((t): t is string => Boolean(t && t.trim() !== ""))
      )
    );

    const primarySku =
      variationNodes.find((v) => v.sku && v.sku !== "SEM-SKU")?.sku || "SEM-SKU";
    const primaryStatus = allOptions.some((o) => o.status === "active")
      ? "active"
      : "paused";
    const shippingType = allOptions.some((o) => o.shippingType === "ml_full")
      ? "ml_full"
      : allOptions[0]?.shippingType || "padrao";

    familyProducts.push({
      groupKey: family.family_id,
      familyId: family.family_id.replace(/^LEGACY_/i, ""),
      isOfficialFamilyId: family.is_official_family_id,
      familyTitle: family.title,
      primarySku,
      thumbnail: distinctThumbs[0] || null,
      collageThumbnails: distinctThumbs.slice(0, 4),
      extraPhotosCount: Math.max(0, variationNodes.length - 3),
      totalStock,
      totalSold,
      totalVisits,
      totalSales7d,
      totalSales30d,
      conversionRate,
      trend,
      trendPct: 0,
      sparklinePoints: [],
      minBasePrice,
      maxBasePrice,
      minPromoPrice,
      maxPromoPrice,
      minPrice,
      maxPrice,
      hasPromoInFamily: promoOptions.length > 0,
      hasWholesaleInFamily: allOptions.some((o) => o.hasWholesale),
      hasClassic: allOptions.some((o) => o.channelType === "classic"),
      hasPremium: allOptions.some((o) => o.channelType === "premium"),
      hasBothChannels:
        allOptions.some((o) => o.channelType === "classic") &&
        allOptions.some((o) => o.channelType === "premium"),
      hasCatalog: allOptions.some((o) => o.isCatalog),
      hasFreeShipping: allOptions.some((o) => o.freeShipping),
      hasBuyerShipping: allOptions.some((o) => !o.freeShipping),
      maxSaleFee:
        allOptions.length > 0 ? Math.max(...allOptions.map((o) => o.saleFeeAmount)) : 0,
      maxShippingCost:
        allOptions.length > 0 ? Math.max(...allOptions.map((o) => o.shippingCost)) : 0,
      minNetAmount,
      maxNetAmount,
      avgQualityScore,
      totalObjectives,
      inactiveVariationsCount,
      primaryStatus,
      shippingType,
      allListings: [],
      variations: variationNodes,
    });
  }

  // KPIs consolidados direto das tabelas normalizadas (zero duplicação de estoque ou visitas)
  const totalFamilies = familyProducts.length;
  const totalVariations = familyProducts.reduce((acc, f) => acc + f.variations.length, 0);
  const allActiveOptions = familyProducts.flatMap((f) =>
    f.variations.flatMap((v) => v.sellingOptions)
  );
  const totalSaleOptions = allActiveOptions.length;
  const totalStock = familyProducts.reduce((acc, f) => acc + f.totalStock, 0);
  const totalVisits7d = allActiveOptions.reduce((acc, o) => acc + o.visits, 0);
  const totalSales7d = allActiveOptions.reduce((acc, o) => acc + o.sales7d, 0);
  const totalSales30d = allActiveOptions.reduce((acc, o) => acc + o.sales30d, 0);
  const overallConversion7d =
    totalVisits7d > 0 ? round2((totalSales7d / totalVisits7d) * 100) : 0;
  const avgNetReceive =
    totalSaleOptions > 0
      ? round2(
          allActiveOptions.reduce((acc, o) => acc + o.netAmount, 0) / totalSaleOptions
        )
      : 0;

  return {
    families: familyProducts,
    kpis: {
      totalFamilies,
      totalVariations,
      totalSaleOptions,
      totalStock,
      totalVisits7d,
      totalSales7d,
      totalSales30d,
      overallConversion7d,
      avgNetReceive,
    },
  };
}
