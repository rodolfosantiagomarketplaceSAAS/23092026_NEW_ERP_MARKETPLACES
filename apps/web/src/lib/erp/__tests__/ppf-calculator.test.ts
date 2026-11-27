import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEnrichedErpProducts,
  calculatePpfConsumption,
  dimensionToMeters,
} from "../ppf-calculator";
import type { ErpPpfRoll, ErpProduct } from "@/types/erp-products";

test("dimensionToMeters converts mm and cm accurately", () => {
  assert.equal(dimensionToMeters(50, "cm"), 0.5);
  assert.equal(dimensionToMeters(500, "mm"), 0.5);
  assert.equal(dimensionToMeters(1520, "mm"), 1.52);
});

test("calculatePpfConsumption computes proportional area cost and bobina linear meters with waste margin", () => {
  // Bobina 12m x 1,52m a R$ 220/m | Peça 50cm x 30cm | +15% borda
  const res = calculatePpfConsumption({
    width: 50,
    height: 30,
    dimensionUnit: "cm",
    pieceCount: 1,
    wasteMarginPct: 15,
    calcMode: "area",
    rollWidthCm: 152,
    rollLengthM: 12,
    costPerLinearMeter: 220,
  });

  // 0.50 * 0.30 = 0.15 m² líquido -> * 1.15 = 0.1725 m² bruto
  assert.equal(res.netAreaM2, 0.15);
  assert.equal(res.grossAreaM2, 0.1725);
  // 0.1725 / 1.52 = 0.113487 m lineares equivalentes
  assert.ok(Math.abs(res.linearMeters - 0.113487) < 0.00001);
  // 0.113487 * 220 = R$ 24.97
  assert.equal(res.calculatedCost, 24.97);
  // 12 / 0.113487 = 105 peças por bobina
  assert.equal(res.piecesPerFullRoll, 105);
});

test("calculatePpfConsumption supports mm units and linear cut mode", () => {
  // Peça 1000mm (1m) de comprimento no modo linear fixo com 10% de margem -> 1.10m * R$ 220 = R$ 242,00
  const res = calculatePpfConsumption({
    width: 1520,
    height: 1000,
    dimensionUnit: "mm",
    pieceCount: 1,
    wasteMarginPct: 10,
    calcMode: "linear",
    rollWidthCm: 152,
    rollLengthM: 12,
    costPerLinearMeter: 220,
  });

  assert.equal(res.linearMeters, 1.1);
  assert.equal(res.calculatedCost, 242);
  assert.equal(res.piecesPerFullRoll, 10);
});

test("buildEnrichedErpProducts aggregates Kit BOM cost, weight, cost breakdown, and PPF roll meters", () => {
  const roll: ErpPpfRoll = {
    id: "roll-1",
    organization_id: "org-1",
    user_id: "u-1",
    code: "BOB-001",
    name: "PPF TPU Brilho 1,52m",
    brand: "3M",
    finish: "brilho",
    thickness_microns: 190,
    roll_width_cm: 152,
    roll_length_m: 12,
    cost_per_linear_meter: 220,
    default_waste_margin_pct: 15,
    total_meters_purchased: 12,
    remaining_meters: 10,
    min_alert_meters: 2,
    supplier: null,
    lot_number: null,
    notes: null,
    active: true,
    created_at: "",
    updated_at: "",
  };

  const baseFields = {
    organization_id: "org-1",
    user_id: "u-1",
    ean: null,
    description: null,
    category: null,
    brand: null,
    supplier: null,
    ncm: null,
    unit: "UN",
    status: "active" as const,
    thumbnail_url: null,
    photos: [],
    depth: null,
    ppf_area_m2: 0,
    ppf_linear_meters: 0,
    ppf_calculated_cost: 0,
    extra_cost: 0,
    total_cost: 0,
    suggested_price: 0,
    min_price: 0,
    stock_quantity: 10,
    min_stock_quantity: 2,
    storage_location: null,
    notes: null,
    created_at: "",
    updated_at: "",
  };

  const ppfPiece: ErpProduct = {
    ...baseFields,
    id: "prod-ppf",
    product_type: "ppf_piece",
    code: "PPF-01",
    sku: "PPF-FAROL",
    name: "Película Farol Par",
    cost_category: "material",
    dimension_unit: "cm",
    width: 50,
    height: 30,
    weight_grams: 80,
    uses_ppf_roll: true,
    ppf_roll_id: "roll-1",
    ppf_calc_mode: "area",
    ppf_waste_margin_pct: 15,
    ppf_piece_count: 1,
    manual_cost: 0,
  };

  const spatula: ErpProduct = {
    ...baseFields,
    id: "prod-acc",
    product_type: "simple",
    code: "ACC-01",
    sku: "ESPATULA-FELTRO",
    name: "Espátula com Feltro",
    cost_category: "accessories",
    dimension_unit: "cm",
    width: 10,
    height: 7,
    weight_grams: 35,
    uses_ppf_roll: false,
    ppf_roll_id: null,
    ppf_calc_mode: "area",
    ppf_waste_margin_pct: 0,
    ppf_piece_count: 1,
    manual_cost: 4.5,
  };

  const kit: ErpProduct = {
    ...baseFields,
    id: "prod-kit",
    product_type: "kit",
    code: "KIT-01",
    sku: "KIT-PPF-CIVIC",
    name: "Kit PPF Farol + Espátula",
    unit: "KIT",
    cost_category: "material",
    dimension_unit: "cm",
    width: null,
    height: null,
    weight_grams: 0,
    uses_ppf_roll: false,
    ppf_roll_id: null,
    ppf_calc_mode: "area",
    ppf_waste_margin_pct: 0,
    ppf_piece_count: 1,
    manual_cost: 0,
  };

  const enriched = buildEnrichedErpProducts(
    [ppfPiece, spatula, kit],
    [roll],
    [
      {
        id: "ki-1",
        kit_product_id: "prod-kit",
        component_product_id: "prod-ppf",
        quantity: 2,
        sort_order: 0,
        notes: null,
      },
      {
        id: "ki-2",
        kit_product_id: "prod-kit",
        component_product_id: "prod-acc",
        quantity: 1,
        sort_order: 1,
        notes: null,
      },
    ]
  );

  const enrichedKit = enriched.find((p) => p.id === "prod-kit")!;
  // 2x 24.97 = 49.94 (material) + 1x 4.50 (accessories) = 54.44
  assert.equal(enrichedKit.computed_cost_breakdown.material_cost, 49.94);
  assert.equal(enrichedKit.computed_cost_breakdown.accessories_kit_cost, 4.5);
  assert.equal(enrichedKit.computed_total_cost, 54.44);
  // Peso: 2*80 + 35 = 195g
  assert.equal(enrichedKit.computed_total_weight_grams, 195);
  // Consumo bobina: 2 * 0.113487 = 0.226974 m
  assert.ok(Math.abs(enrichedKit.computed_total_ppf_meters - 0.226974) < 0.00001);
  assert.equal(enrichedKit.roll_consumptions.length, 1);
});
