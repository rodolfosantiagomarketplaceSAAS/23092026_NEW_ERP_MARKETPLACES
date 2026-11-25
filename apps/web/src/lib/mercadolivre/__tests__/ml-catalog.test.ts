import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCatalogHierarchy,
  type EnrichedMlItemData,
} from "../catalog-sync";
import { buildHierarchyFromNormalizedTables } from "../../catalogo/mlCatalogRepository";
import type {
  MlFamilyDbRow,
  MlSaleOptionDbRow,
  MlVariationDbRow,
} from "../../../types/ml-catalog";

function makeEnrichedItem(overrides: Partial<EnrichedMlItemData> & { id: string }): EnrichedMlItemData {
  const { id, ...rest } = overrides;
  const basePrice = rest.basePrice ?? 100;
  const promoPrice = rest.promoPrice ?? null;
  const activePrice = promoPrice ?? basePrice;
  const saleFeeAmount = rest.saleFeeAmount ?? 12;
  const shippingCostAmount = rest.shippingCostAmount ?? 8;

  return {
    item: {
      id,
      title: "Película PPF Protetor Concha Maçaneta Ppf Transparente Brilho",
      family_id: "1366747239142353",
      family_name: "Película PPF Protetor Concha Maçaneta",
      user_product_id: "MLBU10001",
      listing_type_id: "gold_special",
      catalog_listing: false,
      available_quantity: 50,
      sold_quantity: 10,
      status: "active",
      permalink: `https://produto.mercadolivre.com.br/${id.replace(/^MLB/, "MLB-")}`,
      attributes: [{ id: "SELLER_SKU", value_name: "0411202611" }],
      ...(rest.item || {}),
    },
    basePrice,
    promoPrice,
    activePrice,
    hasWholesale: rest.hasWholesale ?? false,
    saleFeeAmount,
    saleFeePct: rest.saleFeePct ?? 12,
    shippingCostAmount,
    freeShipping: rest.freeShipping ?? false,
    shippingModeLabel: rest.shippingModeLabel ?? "Envio por conta do comprador",
    shippingLogisticType: rest.shippingLogisticType ?? "ml_coleta",
    netReceiveAmount: rest.netReceiveAmount ?? Number((activePrice - saleFeeAmount - shippingCostAmount).toFixed(2)),
    visits7d: rest.visits7d ?? 0,
    sales7d: rest.sales7d ?? 0,
    sales30d: rest.sales30d ?? 0,
    conversionRate7d: rest.conversionRate7d ?? 0,
    healthScore: rest.healthScore ?? 76,
    pendingGoalsCount: rest.pendingGoalsCount ?? 2,
    recommendationTitle: rest.recommendationTitle ?? null,
    recommendationAction: rest.recommendationAction ?? null,
  };
}

test("normalizeCatalogHierarchy aligns mlbs_list 1:1 with sorted sale options (Classic before Premium) and never doubles stock", () => {
  // Premium arrives first from ML API, Classic arrives second
  const premiumItem = makeEnrichedItem({
    id: "MLB7940105506",
    item: {
      id: "MLB7940105506",
      title: "Película PPF Protetor Concha Maçaneta Ppf Transparente Brilho",
      family_id: "1366747239142353",
      family_name: "Película PPF Protetor Concha Maçaneta",
      user_product_id: "MLBU10001",
      listing_type_id: "gold_pro",
      available_quantity: 40,
      status: "active",
    },
    basePrice: 89.9,
    promoPrice: 79.9,
    saleFeeAmount: 13.58,
    shippingCostAmount: 15.46,
    freeShipping: true,
    shippingModeLabel: "Frete grátis",
    netReceiveAmount: 50.86,
    visits7d: 20,
    sales7d: 1,
    sales30d: 4,
    conversionRate7d: 5,
    healthScore: 68,
    pendingGoalsCount: 3,
  });

  const classicItem = makeEnrichedItem({
    id: "MLB7940105501",
    item: {
      id: "MLB7940105501",
      title: "Película PPF Protetor Concha Maçaneta Ppf Transparente Brilho",
      family_id: "1366747239142353",
      family_name: "Película PPF Protetor Concha Maçaneta",
      user_product_id: "MLBU10001",
      listing_type_id: "gold_special",
      available_quantity: 40,
      status: "active",
    },
    basePrice: 68.9,
    promoPrice: 65.45,
    hasWholesale: true,
    saleFeeAmount: 7.85,
    shippingCostAmount: 8.25,
    freeShipping: false,
    shippingModeLabel: "Envio por conta do comprador",
    netReceiveAmount: 49.35,
    visits7d: 80,
    sales7d: 4,
    sales30d: 12,
    conversionRate7d: 5,
    healthScore: 76,
    pendingGoalsCount: 2,
  });

  const batch = normalizeCatalogHierarchy([premiumItem, classicItem]);

  assert.equal(batch.families.length, 1);
  assert.equal(batch.variations.length, 1);
  assert.equal(batch.saleOptions.length, 2);

  // Stock is unified at Level 2 (40, NOT 80)
  assert.equal(batch.variations[0].available_quantity, 40);

  // Classic is sorted first, Premium second — AND mlbs_list matches 1:1
  assert.equal(batch.saleOptions[0].item_id, "MLB7940105501");
  assert.equal(batch.saleOptions[0].listing_type_id, "gold_special");
  assert.equal(batch.saleOptions[1].item_id, "MLB7940105506");
  assert.equal(batch.saleOptions[1].listing_type_id, "gold_pro");

  assert.deepEqual(
    batch.variations[0].mlbs_list.map((m) => m.item_id),
    ["MLB7940105501", "MLB7940105506"]
  );
  assert.deepEqual(
    batch.variations[0].mlbs_list.map((m) => m.channel_label),
    ["Clássico", "Premium"]
  );
});

test("normalizeCatalogHierarchy isolates legacy items without family_id/user_product_id using deterministic LEGACY keys", () => {
  const legacyItem = makeEnrichedItem({
    id: "MLB555000111",
    item: {
      id: "MLB555000111",
      title: "Anúncio Antigo Sem Family ID",
      family_id: null,
      family_name: null,
      user_product_id: null,
      listing_type_id: "gold_special",
      available_quantity: 12,
      status: "active",
    },
  });

  const batch = normalizeCatalogHierarchy([legacyItem]);
  assert.equal(batch.families[0].family_id, "LEGACY_MLB555000111");
  assert.equal(batch.families[0].is_official_family_id, false);
  assert.equal(batch.variations[0].user_product_id, "LEGACY_UP_MLB555000111");
});

test("buildHierarchyFromNormalizedTables aggregates stock only from Level 2 and preserves exact zero metrics without synthetic seed values", () => {
  const now = "2026-11-25T18:00:00.000Z";
  const dbFamilies: MlFamilyDbRow[] = [
    {
      family_id: "1366747239142353",
      seller_id: "12345",
      is_official_family_id: true,
      title: "Película PPF Protetor Concha Maçaneta",
      thumbnail_url: null,
      status: "active",
      last_synced_at: now,
    },
  ];

  const dbVariations: MlVariationDbRow[] = [
    {
      user_product_id: "MLBU1",
      family_id: "1366747239142353",
      seller_id: "12345",
      variation_name: "Ppf Transparente Brilho",
      sku: "SKU-BRILHO",
      thumbnail_url: null,
      available_quantity: 30,
      mlbs_list: [],
      last_synced_at: now,
    },
    {
      user_product_id: "MLBU2",
      family_id: "1366747239142353",
      seller_id: "12345",
      variation_name: "Ppf Transparente Fosco",
      sku: "SKU-FOSCO",
      thumbnail_url: null,
      available_quantity: 20,
      mlbs_list: [],
      last_synced_at: now,
    },
  ];

  const dbOptions: MlSaleOptionDbRow[] = [
    {
      item_id: "MLB101",
      user_product_id: "MLBU1",
      family_id: "1366747239142353",
      seller_id: "12345",
      title: "PPF Brilho Clássico",
      category_id: "MLB1234",
      listing_type_id: "gold_special",
      catalog_listing: false,
      catalog_product_id: null,
      has_wholesale: true,
      base_price: 70,
      promo_price: 60,
      active_price: 60,
      sale_fee_amount: 7.2,
      sale_fee_pct: 12,
      shipping_cost_amount: 8.1,
      free_shipping: false,
      shipping_mode_label: "Envio por conta do comprador",
      shipping_logistic_type: "ml_coleta",
      net_receive_amount: 44.7,
      visits_7d: 50,
      sales_7d: 5,
      sales_30d: 15,
      sold_quantity: 40,
      conversion_rate_7d: 10,
      health_score: 76,
      pending_goals_count: 2,
      recommendation_title: "Adicione ficha técnica",
      recommendation_action: "Preencha compatibilidade do veículo",
      status: "active",
      sub_status: null,
      permalink: "https://produto.mercadolivre.com.br/MLB-101",
      thumbnail_url: null,
      last_synced_at: now,
    },
    {
      item_id: "MLB102",
      user_product_id: "MLBU1",
      family_id: "1366747239142353",
      seller_id: "12345",
      title: "PPF Brilho Premium",
      category_id: "MLB1234",
      listing_type_id: "gold_pro",
      catalog_listing: false,
      catalog_product_id: null,
      has_wholesale: false,
      base_price: 80,
      promo_price: null,
      active_price: 80,
      sale_fee_amount: 13.6,
      sale_fee_pct: 17,
      shipping_cost_amount: 15.4,
      free_shipping: true,
      shipping_mode_label: "Frete grátis",
      shipping_logistic_type: "ml_coleta",
      net_receive_amount: 51,
      visits_7d: 0,
      sales_7d: 0,
      sales_30d: 0,
      sold_quantity: 0,
      conversion_rate_7d: 0,
      health_score: null,
      pending_goals_count: 0,
      recommendation_title: null,
      recommendation_action: null,
      status: "active",
      sub_status: null,
      permalink: "https://produto.mercadolivre.com.br/MLB-102",
      thumbnail_url: null,
      last_synced_at: now,
    },
    {
      item_id: "MLB201",
      user_product_id: "MLBU2",
      family_id: "1366747239142353",
      seller_id: "12345",
      title: "PPF Fosco Clássico",
      category_id: "MLB1234",
      listing_type_id: "gold_special",
      catalog_listing: true,
      catalog_product_id: "MLB999",
      has_wholesale: false,
      base_price: 75,
      promo_price: null,
      active_price: 75,
      sale_fee_amount: 9,
      sale_fee_pct: 12,
      shipping_cost_amount: 8.1,
      free_shipping: false,
      shipping_mode_label: "Envio por conta do comprador",
      shipping_logistic_type: "ml_full",
      net_receive_amount: 57.9,
      visits_7d: 50,
      sales_7d: 5,
      sales_30d: 10,
      sold_quantity: 12,
      conversion_rate_7d: 10,
      health_score: 84,
      pending_goals_count: 1,
      recommendation_title: null,
      recommendation_action: null,
      status: "active",
      sub_status: null,
      permalink: "https://produto.mercadolivre.com.br/MLB-201",
      thumbnail_url: null,
      last_synced_at: now,
    },
  ];

  const { families, kpis } = buildHierarchyFromNormalizedTables(
    dbFamilies,
    dbVariations,
    dbOptions
  );

  assert.equal(kpis.totalFamilies, 1);
  assert.equal(kpis.totalVariations, 2);
  assert.equal(kpis.totalSaleOptions, 3);
  // Stock MUST be 30 + 20 = 50 (NOT 30 + 30 + 20 = 80!)
  assert.equal(kpis.totalStock, 50);
  assert.equal(families[0].totalStock, 50);

  // Exact visits & sales (MLB102 stays 0, never fabricated by seed!)
  assert.equal(kpis.totalVisits7d, 100);
  assert.equal(kpis.totalSales7d, 10);
  assert.equal(kpis.totalSales30d, 25);
  assert.equal(kpis.overallConversion7d, 10);
  assert.equal(kpis.avgNetReceive, 51.2);

  const mlbu1 = families[0].variations.find((v) => v.userProductId === "MLBU1");
  assert.ok(mlbu1);
  assert.equal(mlbu1.sellingOptions[1].externalId, "MLB102");
  assert.equal(mlbu1.sellingOptions[1].visits, 0);
  assert.equal(mlbu1.sellingOptions[1].sales7d, 0);
  assert.equal(mlbu1.sellingOptions[1].qualityScore, null);
  assert.equal(mlbu1.sellingOptions[0].recommendationTitle, "Adicione ficha técnica");
});
