import type { AuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter, upsertTenantCostTemplate } from "@/lib/mercadolivre/tenant-scope";
import {
  buildEnrichedErpProducts,
  calculatePpfConsumption,
  round2,
  round4,
  round6,
} from "@/lib/erp/ppf-calculator";
import type {
  ErpOrderCostLotSummaryItem,
  ErpPpfRoll,
  ErpPpfRollLot,
  ErpProduct,
} from "@/types/erp-products";

export interface FifoAllocationLine {
  lot_id: string | null;
  lot_code: string;
  roll_id: string;
  roll_code: string;
  roll_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  meters: number;
  area_m2: number;
  unit_cost_per_meter: number;
  total_cost: number;
  lot_balance_after: number;
  lot_exhausted: boolean;
}

export interface FifoAllocationResult {
  allocations: FifoAllocationLine[];
  totalMeters: number;
  totalAreaM2: number;
  totalCost: number;
  weightedUnitCostPerMeter: number;
  touchedLotIds: string[];
  promotedLotId: string | null;
}

/**
 * Ordena os lotes de uma bobina em ordem estrita PEPS (FIFO):
 * 1º: status 'in_use'
 * 2º: status 'queued' ordenado por queue_order ASC, purchase_date ASC, created_at ASC
 * 3º: demais ('exhausted', 'archived') por purchase_date DESC
 */
export function sortRollLotsFifo(lots: ErpPpfRollLot[]): ErpPpfRollLot[] {
  const rank = (s: ErpPpfRollLot["status"]) => {
    if (s === "in_use") return 0;
    if (s === "queued") return 1;
    if (s === "exhausted") return 2;
    return 3;
  };

  return [...lots].sort((a, b) => {
    const rDiff = rank(a.status) - rank(b.status);
    if (rDiff !== 0) return rDiff;
    if (a.status === "queued" || a.status === "in_use") {
      if (a.queue_order !== b.queue_order) return a.queue_order - b.queue_order;
      if (a.purchase_date !== b.purchase_date) {
        return a.purchase_date.localeCompare(b.purchase_date);
      }
      return a.created_at.localeCompare(b.created_at);
    }
    return b.purchase_date.localeCompare(a.purchase_date);
  });
}

/**
 * Retorna o lote vigente atual da bobina (em uso com saldo > 0, ou o 1º da fila PEPS).
 */
export function getCurrentActiveLot(lots: ErpPpfRollLot[]): ErpPpfRollLot | null {
  if (!lots || lots.length === 0) return null;
  const sorted = sortRollLotsFifo(lots);
  const inUse = sorted.find((l) => l.status === "in_use" && Number(l.remaining_meters) > 0);
  if (inUse) return inUse;
  const inUseAny = sorted.find((l) => l.status === "in_use");
  if (inUseAny) return inUseAny;
  const nextQueued = sorted.find((l) => l.status === "queued" && Number(l.remaining_meters) > 0);
  if (nextQueued) return nextQueued;
  return sorted[0] ?? null;
}

/**
 * Motor PEPS (FIFO) com Rateio Exato entre Lotes:
 * Consome `metersNeeded` a partir do lote `in_use`; se o saldo zerar no meio do pedido,
 * encerra o lote antigo (`exhausted`), promove o próximo da fila (`in_use`) e rateia o restante
 * no custo da nova bobina — mutando o array `mutableLots` em memória para chamadas em lote.
 */
export function allocateFifoMetersFromLots(params: {
  mutableLots: ErpPpfRollLot[];
  roll: Pick<
    ErpPpfRoll,
    "id" | "code" | "name" | "roll_width_cm" | "cost_per_linear_meter" | "supplier_id" | "supplier"
  >;
  metersNeeded: number;
  nowIso?: string;
}): FifoAllocationResult {
  const { mutableLots, roll, nowIso = new Date().toISOString() } = params;
  const metersNeeded = Math.max(0, round6(params.metersNeeded));
  const rollWidthM = Math.max(0.01, Number(roll.roll_width_cm || 152) / 100);

  if (metersNeeded <= 0) {
    return {
      allocations: [],
      totalMeters: 0,
      totalAreaM2: 0,
      totalCost: 0,
      weightedUnitCostPerMeter: 0,
      touchedLotIds: [],
      promotedLotId: null,
    };
  }

  const eligible = sortRollLotsFifo(
    mutableLots.filter((l) => l.status === "in_use" || l.status === "queued")
  );

  const allocations: FifoAllocationLine[] = [];
  const touchedLotIds = new Set<string>();
  let remainingToConsume = metersNeeded;
  let promotedLotId: string | null = null;
  let lastUsedLot: ErpPpfRollLot | null = null;

  for (const lot of eligible) {
    if (remainingToConsume <= 0.000001) break;
    const avail = Math.max(0, Number(lot.remaining_meters || 0));
    if (avail <= 0.000001) {
      if (lot.status === "in_use") {
        lot.status = "exhausted";
        lot.remaining_meters = 0;
        lot.exhausted_at = nowIso;
        touchedLotIds.add(lot.id);
      }
      continue;
    }

    // Se pegou um lote que estava na fila, promove para in_use
    if (lot.status === "queued") {
      lot.status = "in_use";
      if (!lot.started_using_at) lot.started_using_at = nowIso;
      promotedLotId = lot.id;
      touchedLotIds.add(lot.id);
    }

    const take = round6(Math.min(avail, remainingToConsume));
    const nextBalance = round4(Math.max(0, avail - take));
    const unitCost = Number(lot.cost_per_linear_meter || 0);
    const lineCost = round2(take * unitCost);
    const lineArea = round6(take * rollWidthM);

    lot.remaining_meters = nextBalance;
    const becameExhausted = nextBalance <= 0.0005;
    if (becameExhausted) {
      lot.remaining_meters = 0;
      lot.status = "exhausted";
      lot.exhausted_at = nowIso;
    }

    touchedLotIds.add(lot.id);
    lastUsedLot = lot;

    allocations.push({
      lot_id: lot.id,
      lot_code: lot.lot_code,
      roll_id: roll.id,
      roll_code: roll.code,
      roll_name: roll.name,
      supplier_id: lot.supplier_id ?? roll.supplier_id ?? null,
      supplier_name: lot.supplier_name ?? roll.supplier ?? null,
      meters: take,
      area_m2: lineArea,
      unit_cost_per_meter: unitCost,
      total_cost: lineCost,
      lot_balance_after: lot.remaining_meters,
      lot_exhausted: becameExhausted,
    });

    remainingToConsume = round6(remainingToConsume - take);
  }

  // Após consumir, se o lote em uso esgotou, já promove o próximo da fila para `in_use`
  const hasActiveNow = mutableLots.some(
    (l) => l.status === "in_use" && Number(l.remaining_meters) > 0
  );
  if (!hasActiveNow) {
    const nextQueued = sortRollLotsFifo(mutableLots).find(
      (l) => l.status === "queued" && Number(l.remaining_meters) > 0
    );
    if (nextQueued) {
      nextQueued.status = "in_use";
      if (!nextQueued.started_using_at) nextQueued.started_using_at = nowIso;
      promotedLotId = nextQueued.id;
      touchedLotIds.add(nextQueued.id);
    }
  }

  // Se faltou saldo em todos os lotes, registra o excedente no custo do último lote conhecido ou da bobina
  // (`lot_id: null` diferencia do saldo físico já consumido do lote e preserva unicidade por pedido/lote)
  if (remainingToConsume > 0.00001) {
    const fallbackLot = lastUsedLot ?? getCurrentActiveLot(mutableLots);
    const fallbackUnitCost = Number(
      fallbackLot?.cost_per_linear_meter ?? roll.cost_per_linear_meter ?? 0
    );
    allocations.push({
      lot_id: null,
      lot_code: fallbackLot ? `${fallbackLot.lot_code}-EXCEDENTE` : "SEM-SALDO-LOTE",
      roll_id: roll.id,
      roll_code: roll.code,
      roll_name: roll.name,
      supplier_id: fallbackLot?.supplier_id ?? roll.supplier_id ?? null,
      supplier_name: fallbackLot?.supplier_name ?? roll.supplier ?? null,
      meters: remainingToConsume,
      area_m2: round6(remainingToConsume * rollWidthM),
      unit_cost_per_meter: fallbackUnitCost,
      total_cost: round2(remainingToConsume * fallbackUnitCost),
      lot_balance_after: 0,
      lot_exhausted: true,
    });
  }

  const totalCost = round2(allocations.reduce((acc, a) => acc + a.total_cost, 0));
  const totalMeters = round6(allocations.reduce((acc, a) => acc + a.meters, 0));
  const totalAreaM2 = round6(allocations.reduce((acc, a) => acc + a.area_m2, 0));
  const weightedUnitCostPerMeter =
    totalMeters > 0 ? round4(totalCost / totalMeters) : 0;

  return {
    allocations,
    totalMeters,
    totalAreaM2,
    totalCost,
    weightedUnitCostPerMeter,
    touchedLotIds: Array.from(touchedLotIds),
    promotedLotId,
  };
}

export function toOrderCostLotSummary(
  allocations: FifoAllocationLine[]
): ErpOrderCostLotSummaryItem[] {
  return allocations.map((a) => ({
    lot_id: a.lot_id,
    lot_code: a.lot_code,
    roll_id: a.roll_id,
    roll_code: a.roll_code,
    supplier_id: a.supplier_id,
    supplier_name: a.supplier_name,
    meters: a.meters,
    area_m2: a.area_m2,
    unit_cost_per_meter: a.unit_cost_per_meter,
    total_cost: a.total_cost,
  }));
}

/**
 * Sincroniza o cabeçalho da bobina (`erp_ppf_rolls`), o custo vigente dos produtos vinculados
 * e os templates de custo futuros (`product_cost_templates`) a partir do lote `in_use` atual.
 *
 * GARANTIA HISTÓRICA: Esta função NUNCA altera pedidos já gravados em `ml_sales_orders`.
 */
export async function syncRollSummaryAndCurrentProductCosts(
  ctx: Pick<AuthContext, "userId" | "organizationId">,
  rollId: string
): Promise<{ activeLot: ErpPpfRollLot | null; totalRemainingMeters: number }> {
  const admin = createSupabaseAdminClient();

  const [rollRes, lotsRes] = await Promise.all([
    applyTenantFilter(admin.from("erp_ppf_rolls").select("*").eq("id", rollId), ctx).single(),
    applyTenantFilter(
      admin.from("erp_ppf_roll_lots").select("*").eq("ppf_roll_id", rollId),
      ctx
    ),
  ]);

  if (rollRes.error || !rollRes.data) {
    return { activeLot: null, totalRemainingMeters: 0 };
  }

  const roll = rollRes.data as ErpPpfRoll;
  const lots = (lotsRes.data ?? []) as ErpPpfRollLot[];
  const activeLot = getCurrentActiveLot(lots);

  const totalRemainingMeters = round4(
    lots
      .filter((l) => l.status === "in_use" || l.status === "queued")
      .reduce((acc, l) => acc + Math.max(0, Number(l.remaining_meters || 0)), 0)
  );
  const totalPurchasedMeters = round4(
    lots
      .filter((l) => l.status !== "archived")
      .reduce((acc, l) => acc + Math.max(0, Number(l.initial_meters || 0)), 0)
  );

  const nextCostPerMeter = activeLot
    ? round2(Number(activeLot.cost_per_linear_meter))
    : Number(roll.cost_per_linear_meter);

  const rollUpdate: Record<string, unknown> = {
    remaining_meters: totalRemainingMeters,
    total_meters_purchased: totalPurchasedMeters > 0 ? totalPurchasedMeters : roll.total_meters_purchased,
    cost_per_linear_meter: nextCostPerMeter,
  };

  if (activeLot) {
    rollUpdate.lot_number = activeLot.lot_code;
    if (activeLot.supplier_id) rollUpdate.supplier_id = activeLot.supplier_id;
    if (activeLot.supplier_name) rollUpdate.supplier = activeLot.supplier_name;
  }

  await applyTenantFilter(
    admin.from("erp_ppf_rolls").update(rollUpdate).eq("id", rollId),
    ctx
  );

  // Recalcula custo vigente nos produtos que usam esta bobina em batches paralelos (elimina N+1)
  const { data: linkedProducts } = await applyTenantFilter(
    admin.from("erp_products").select("*").eq("ppf_roll_id", rollId).eq("uses_ppf_roll", true),
    ctx
  );

  const productsList = (linkedProducts ?? []) as ErpProduct[];
  const updatedProductIds = new Set<string>(productsList.map((p) => p.id));

  const BATCH_SIZE = 20;
  for (let i = 0; i < productsList.length; i += BATCH_SIZE) {
    const batch = productsList.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((prod) => {
        const calc = calculatePpfConsumption({
          width: Number(prod.width || 0),
          height: Number(prod.height || 0),
          dimensionUnit: prod.dimension_unit,
          pieceCount: prod.ppf_piece_count || 1,
          wasteMarginPct: Number(prod.ppf_waste_margin_pct ?? roll.default_waste_margin_pct),
          calcMode: prod.ppf_calc_mode || "area",
          rollWidthCm: Number(roll.roll_width_cm),
          rollLengthM: Number(roll.roll_length_m),
          costPerLinearMeter: nextCostPerMeter,
        });
        return admin
          .from("erp_products")
          .update({
            ppf_area_m2: calc.grossAreaM2,
            ppf_linear_meters: calc.linearMeters,
            ppf_calculated_cost: calc.calculatedCost,
            total_cost: round2(calc.calculatedCost + Number(prod.extra_cost || 0)),
          })
          .eq("id", prod.id);
      })
    );
  }

  // Atualiza templates futuros de anúncios com auto_sync_cost_template = true (NUNCA altera pedidos antigos!)
  if (updatedProductIds.size > 0) {
    const [allRollsRes, allProductsRes, allKitItemsRes, autoLinksRes] = await Promise.all([
      applyTenantFilter(admin.from("erp_ppf_rolls").select("*"), ctx),
      applyTenantFilter(admin.from("erp_products").select("*"), ctx),
      applyTenantFilter(admin.from("erp_kit_items").select("*"), ctx),
      applyTenantFilter(
        admin.from("erp_listing_links").select("*").eq("auto_sync_cost_template", true),
        ctx
      ),
    ]);

    const enriched = buildEnrichedErpProducts(
      (allProductsRes.data ?? []) as ErpProduct[],
      (allRollsRes.data ?? []) as ErpPpfRoll[],
      (allKitItemsRes.data ?? []) as Array<{
        id: string;
        kit_product_id: string;
        component_product_id: string;
        quantity: number;
        sort_order: number;
        notes: string | null;
      }>
    );
    const byId = new Map(enriched.map((p) => [p.id, p]));

    for (const lnk of (autoLinksRes.data ?? []) as Array<{
      external_listing_id: string;
      listing_sku: string | null;
      product_id: string;
      quantity_per_sale: number;
    }>) {
      const prod = byId.get(lnk.product_id);
      if (!prod) continue;
      const usesThisRoll = prod.roll_consumptions.some((rc) => rc.roll_id === rollId);
      if (!usesThisRoll) continue;

      const qty = Math.max(0.001, Number(lnk.quantity_per_sale || 1));
      const b = prod.computed_cost_breakdown;
      await upsertTenantCostTemplate(ctx, {
        mlb_id: lnk.external_listing_id,
        sku: lnk.listing_sku || prod.sku,
        material_cost: round2(b.material_cost * qty),
        packaging_cost: round2(b.packaging_cost * qty),
        accessories_kit_cost: round2(b.accessories_kit_cost * qty),
        printing_cost: round2(b.printing_cost * qty),
        logistics_cost: round2(b.logistics_cost * qty),
      });
    }
  }

  return { activeLot, totalRemainingMeters };
}
