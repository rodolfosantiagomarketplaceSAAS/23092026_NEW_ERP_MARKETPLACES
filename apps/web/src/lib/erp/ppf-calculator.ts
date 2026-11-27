import type {
  ErpCostBreakdownByCategory,
  ErpDimensionUnit,
  ErpKitItem,
  ErpPpfCalcMode,
  ErpPpfRoll,
  ErpProduct,
  ErpProductWithSummary,
  ErpRollConsumptionSummary,
} from "@/types/erp-products";

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function round6(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

export interface PpfCalculationInput {
  width: number;
  height: number;
  dimensionUnit: ErpDimensionUnit;
  pieceCount?: number;
  wasteMarginPct: number;
  calcMode: ErpPpfCalcMode;
  rollWidthCm: number;
  rollLengthM: number;
  costPerLinearMeter: number;
}

export interface PpfCalculationResult {
  netAreaM2: number;
  grossAreaM2: number;
  linearMeters: number;
  costPerM2: number;
  calculatedCost: number;
  rollsFraction: number;
  piecesPerFullRoll: number;
}

/**
 * Converte dimensão (mm ou cm) para metros.
 */
export function dimensionToMeters(value: number, unit: ErpDimensionUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return unit === "mm" ? value / 1000 : value / 100;
}

/**
 * Motor oficial de cálculo de consumo e custo de Película PPF em Bobina.
 *
 * Exemplo padrão:
 * - Bobina: 12m x 1,52m (152cm) a R$ 220,00 por metro linear (1m x 1,52m = 1,52m²)
 * - Modo `area`: calcula m² líquido da peça * peças * (1 + margem%), converte em metros lineares
 *   equivalentes da bobina (areaComMargem / larguraBobinaM) e multiplica pelo custo/metro linear.
 * - Modo `linear`: consome o comprimento (height) diretamente sobre a largura inteira da bobina
 *   * peças * (1 + margem%).
 */
export function calculatePpfConsumption(input: PpfCalculationInput): PpfCalculationResult {
  const widthM = dimensionToMeters(input.width, input.dimensionUnit);
  const heightM = dimensionToMeters(input.height, input.dimensionUnit);
  const pieces = Math.max(1, Math.floor(input.pieceCount ?? 1));
  const wasteFactor = 1 + Math.max(0, input.wasteMarginPct) / 100;
  const rollWidthM = Math.max(0.01, (input.rollWidthCm || 152) / 100);
  const rollLengthM = Math.max(0.01, input.rollLengthM || 12);
  const costPerMeter = Math.max(0, input.costPerLinearMeter || 0);
  const costPerM2 = costPerMeter / rollWidthM;

  if (input.calcMode === "linear") {
    if (heightM <= 0) {
      return {
        netAreaM2: 0,
        grossAreaM2: 0,
        linearMeters: 0,
        costPerM2: round4(costPerM2),
        calculatedCost: 0,
        rollsFraction: 0,
        piecesPerFullRoll: 0,
      };
    }

    const netLinear = heightM * pieces;
    const linearMeters = netLinear * wasteFactor;
    const netAreaM2 = netLinear * rollWidthM;
    const grossAreaM2 = linearMeters * rollWidthM;
    const calculatedCost = linearMeters * costPerMeter;
    const rollsFraction = linearMeters / rollLengthM;
    const piecesPerFullRoll = linearMeters > 0 ? Math.floor(rollLengthM / linearMeters) : 0;

    return {
      netAreaM2: round6(netAreaM2),
      grossAreaM2: round6(grossAreaM2),
      linearMeters: round6(linearMeters),
      costPerM2: round4(costPerM2),
      calculatedCost: round2(calculatedCost),
      rollsFraction: round6(rollsFraction),
      piecesPerFullRoll,
    };
  }

  // Modo `area` (padrão proporcional por m² com aproveitamento de largura da bobina)
  if (widthM <= 0 || heightM <= 0) {
    return {
      netAreaM2: 0,
      grossAreaM2: 0,
      linearMeters: 0,
      costPerM2: round4(costPerM2),
      calculatedCost: 0,
      rollsFraction: 0,
      piecesPerFullRoll: 0,
    };
  }

  const netAreaM2 = widthM * heightM * pieces;
  const grossAreaM2 = netAreaM2 * wasteFactor;
  const linearMeters = grossAreaM2 / rollWidthM;
  const calculatedCost = linearMeters * costPerMeter;
  const rollsFraction = linearMeters / rollLengthM;
  const piecesPerFullRoll = linearMeters > 0 ? Math.floor(rollLengthM / linearMeters) : 0;

  return {
    netAreaM2: round6(netAreaM2),
    grossAreaM2: round6(grossAreaM2),
    linearMeters: round6(linearMeters),
    costPerM2: round4(costPerM2),
    calculatedCost: round2(calculatedCost),
    rollsFraction: round6(rollsFraction),
    piecesPerFullRoll,
  };
}

function emptyBreakdown(): ErpCostBreakdownByCategory {
  return {
    material_cost: 0,
    packaging_cost: 0,
    accessories_kit_cost: 0,
    printing_cost: 0,
    logistics_cost: 0,
    total_cost: 0,
  };
}

function addCostToCategory(
  breakdown: ErpCostBreakdownByCategory,
  category: ErpProduct["cost_category"],
  amount: number
) {
  switch (category) {
    case "packaging":
      breakdown.packaging_cost = round2(breakdown.packaging_cost + amount);
      break;
    case "accessories":
      breakdown.accessories_kit_cost = round2(breakdown.accessories_kit_cost + amount);
      break;
    case "printing":
      breakdown.printing_cost = round2(breakdown.printing_cost + amount);
      break;
    case "logistics":
      breakdown.logistics_cost = round2(breakdown.logistics_cost + amount);
      break;
    case "material":
    default:
      breakdown.material_cost = round2(breakdown.material_cost + amount);
      break;
  }
  breakdown.total_cost = round2(
    breakdown.material_cost +
      breakdown.packaging_cost +
      breakdown.accessories_kit_cost +
      breakdown.printing_cost +
      breakdown.logistics_cost
  );
}

function mergeRollConsumptions(
  list: ErpRollConsumptionSummary[]
): ErpRollConsumptionSummary[] {
  const byRoll = new Map<string, ErpRollConsumptionSummary>();
  for (const item of list) {
    const existing = byRoll.get(item.roll_id);
    if (!existing) {
      byRoll.set(item.roll_id, { ...item });
    } else {
      existing.linear_meters = round6(existing.linear_meters + item.linear_meters);
      existing.area_m2 = round6(existing.area_m2 + item.area_m2);
      existing.cost = round2(existing.cost + item.cost);
      existing.rolls_fraction = round6(
        existing.linear_meters / Math.max(0.01, existing.roll_length_m)
      );
    }
  }
  return Array.from(byRoll.values());
}

/**
 * Enriquecimento completo de Produtos e Kits:
 * - Recalcula custo PPF a partir da bobina vinculada (se houver)
 * - Agrega custos, peso, consumo em metros/m² de bobinas e breakdown por categoria de custo para Kits (BOM)
 * - Protegido contra ciclos em kits
 */
export function buildEnrichedErpProducts(
  products: ErpProduct[],
  rolls: ErpPpfRoll[],
  kitItems: Array<{
    id: string;
    kit_product_id: string;
    component_product_id: string;
    quantity: number;
    sort_order: number;
    notes: string | null;
  }>,
  linkedCountsByProductId?: Map<string, number>
): ErpProductWithSummary[] {
  const rollMap = new Map(rolls.map((r) => [r.id, r]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const kitItemsByKitId = new Map<string, typeof kitItems>();

  for (const item of kitItems) {
    const list = kitItemsByKitId.get(item.kit_product_id) ?? [];
    list.push(item);
    kitItemsByKitId.set(item.kit_product_id, list);
  }

  kitItemsByKitId.forEach((list) => {
    list.sort((a, b) => a.sort_order - b.sort_order);
  });

  const memo = new Map<string, ErpProductWithSummary>();

  function resolveProduct(productId: string, visited: Set<string>): ErpProductWithSummary | null {
    const cached = memo.get(productId);
    if (cached) return cached;

    const base = productMap.get(productId);
    if (!base) return null;
    if (visited.has(productId)) return null;

    const nextVisited = new Set(visited);
    nextVisited.add(productId);

    const roll = base.ppf_roll_id ? rollMap.get(base.ppf_roll_id) ?? null : null;
    const breakdown = emptyBreakdown();
    const rollConsumptions: ErpRollConsumptionSummary[] = [];

    if (base.product_type === "kit") {
      const rawItems = kitItemsByKitId.get(base.id) ?? [];
      const resolvedKitItems: ErpKitItem[] = [];
      let totalWeight = Number(base.weight_grams || 0);
      let totalPpfMeters = 0;
      let totalPpfArea = 0;

      for (const ki of rawItems) {
        const comp = resolveProduct(ki.component_product_id, nextVisited);
        const qty = Math.max(0, Number(ki.quantity || 1));
        if (comp) {
          resolvedKitItems.push({
            id: ki.id,
            kit_product_id: ki.kit_product_id,
            component_product_id: ki.component_product_id,
            quantity: qty,
            sort_order: ki.sort_order,
            notes: ki.notes,
            component: comp,
          });

          breakdown.material_cost = round2(
            breakdown.material_cost + comp.computed_cost_breakdown.material_cost * qty
          );
          breakdown.packaging_cost = round2(
            breakdown.packaging_cost + comp.computed_cost_breakdown.packaging_cost * qty
          );
          breakdown.accessories_kit_cost = round2(
            breakdown.accessories_kit_cost +
              comp.computed_cost_breakdown.accessories_kit_cost * qty
          );
          breakdown.printing_cost = round2(
            breakdown.printing_cost + comp.computed_cost_breakdown.printing_cost * qty
          );
          breakdown.logistics_cost = round2(
            breakdown.logistics_cost + comp.computed_cost_breakdown.logistics_cost * qty
          );

          totalWeight += comp.computed_total_weight_grams * qty;
          totalPpfMeters += comp.computed_total_ppf_meters * qty;
          totalPpfArea += comp.computed_total_ppf_area_m2 * qty;

          for (const rc of comp.roll_consumptions) {
            rollConsumptions.push({
              ...rc,
              linear_meters: round6(rc.linear_meters * qty),
              area_m2: round6(rc.area_m2 * qty),
              cost: round2(rc.cost * qty),
              rolls_fraction: round6(
                (rc.linear_meters * qty) / Math.max(0.01, rc.roll_length_m)
              ),
            });
          }
        }
      }

      if (Number(base.extra_cost || 0) > 0) {
        addCostToCategory(breakdown, base.cost_category, Number(base.extra_cost));
      } else {
        breakdown.total_cost = round2(
          breakdown.material_cost +
            breakdown.packaging_cost +
            breakdown.accessories_kit_cost +
            breakdown.printing_cost +
            breakdown.logistics_cost
        );
      }

      const mergedRolls = mergeRollConsumptions(rollConsumptions);
      const result: ErpProductWithSummary = {
        ...base,
        ppf_roll: roll,
        kit_items: resolvedKitItems,
        computed_total_cost: breakdown.total_cost,
        computed_total_weight_grams: round2(totalWeight),
        computed_total_ppf_meters: round6(totalPpfMeters),
        computed_total_ppf_area_m2: round6(totalPpfArea),
        computed_cost_breakdown: breakdown,
        roll_consumptions: mergedRolls,
        linked_listings_count: linkedCountsByProductId?.get(base.id) ?? 0,
      };
      memo.set(productId, result);
      return result;
    }

    // Produto Simples ou Peça PPF
    let ppfCost = 0;
    let ppfMeters = 0;
    let ppfArea = 0;

    if (base.uses_ppf_roll && roll && Number(base.width || 0) > 0 && Number(base.height || 0) > 0) {
      const calc = calculatePpfConsumption({
        width: Number(base.width || 0),
        height: Number(base.height || 0),
        dimensionUnit: base.dimension_unit,
        pieceCount: base.ppf_piece_count || 1,
        wasteMarginPct: Number(base.ppf_waste_margin_pct ?? roll.default_waste_margin_pct ?? 15),
        calcMode: base.ppf_calc_mode || "area",
        rollWidthCm: Number(roll.roll_width_cm || 152),
        rollLengthM: Number(roll.roll_length_m || 12),
        costPerLinearMeter: Number(roll.cost_per_linear_meter || 0),
      });
      ppfCost = calc.calculatedCost;
      ppfMeters = calc.linearMeters;
      ppfArea = calc.grossAreaM2;

      rollConsumptions.push({
        roll_id: roll.id,
        roll_code: roll.code,
        roll_name: roll.name,
        roll_width_cm: Number(roll.roll_width_cm),
        roll_length_m: Number(roll.roll_length_m),
        cost_per_linear_meter: Number(roll.cost_per_linear_meter),
        remaining_meters: Number(roll.remaining_meters),
        linear_meters: calc.linearMeters,
        area_m2: calc.grossAreaM2,
        cost: calc.calculatedCost,
        rolls_fraction: calc.rollsFraction,
      });
    } else if (base.uses_ppf_roll) {
      ppfCost = Number(base.ppf_calculated_cost || 0);
      ppfMeters = Number(base.ppf_linear_meters || 0);
      ppfArea = Number(base.ppf_area_m2 || 0);
    }

    const baseUnitCost = base.uses_ppf_roll
      ? round2(ppfCost + Number(base.extra_cost || 0))
      : round2(Number(base.manual_cost || 0) + Number(base.extra_cost || 0));

    addCostToCategory(breakdown, base.cost_category, baseUnitCost);

    const result: ErpProductWithSummary = {
      ...base,
      ppf_roll: roll,
      kit_items: [],
      computed_total_cost: baseUnitCost,
      computed_total_weight_grams: round2(Number(base.weight_grams || 0)),
      computed_total_ppf_meters: round6(ppfMeters),
      computed_total_ppf_area_m2: round6(ppfArea),
      computed_cost_breakdown: breakdown,
      roll_consumptions: rollConsumptions,
      linked_listings_count: linkedCountsByProductId?.get(base.id) ?? 0,
    };
    memo.set(productId, result);
    return result;
  }

  return products
    .map((p) => resolveProduct(p.id, new Set()))
    .filter((p): p is ErpProductWithSummary => p !== null);
}
