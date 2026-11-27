import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  applyTenantFilter,
  isMissingColumnError,
  isMissingTableError,
} from "@/lib/mercadolivre/tenant-scope";
import { loadErpWorkspaceData } from "@/lib/erp/erp-repository";
import { deductSalesStockSchema } from "@/lib/validators/erp-products";
import { round2, round4, round6 } from "@/lib/erp/ppf-calculator";
import {
  allocateFifoMetersFromLots,
  syncRollSummaryAndCurrentProductCosts,
  toOrderCostLotSummary,
  type FifoAllocationLine,
} from "@/lib/erp/ppf-fifo-engine";
import type {
  ErpOrderRollConsumption,
  ErpPpfRollLot,
  ErpRollConsumptionSummary,
  ErpSalesConsumptionItem,
} from "@/types/erp-products";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const IN_CHUNK_SIZE = 400;
const UPDATE_CONCURRENCY = 20;

function toDateBounds(dateFrom: string, dateTo: string) {
  const fromIso = `${dateFrom.slice(0, 10)}T00:00:00-03:00`;
  const toIso = `${dateTo.slice(0, 10)}T23:59:59-03:00`;
  return { fromIso, toIso };
}

/**
 * Pagina de 1.000 em 1.000 linhas em `ml_sales_orders` para nunca truncar períodos longos.
 */
async function fetchPaginatedValidOrders<T>(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  ctx: Pick<AuthContext, "userId" | "organizationId">;
  columns: string;
  fromIso: string;
  toIso: string;
  ascending?: boolean;
}): Promise<T[]> {
  const { admin, ctx, columns, fromIso, toIso, ascending = true } = params;
  const all: T[] = [];
  let offset = 0;

  while (all.length < MAX_ROWS) {
    const query = applyTenantFilter(
      admin
        .from("ml_sales_orders")
        .select(columns)
        .gte("order_date", fromIso)
        .lte("order_date", toIso)
        .not("status", "in", "(cancelled,returned)")
        .order("order_date", { ascending })
        .range(offset, offset + PAGE_SIZE - 1),
      ctx
    );

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

/**
 * Consulta cirúrgica em chunks `.in("reference_order_id", chunk)` —
 * elimina 100% o bug silencioso do limite de 1.000 linhas do PostgREST quando o Kardex cresce!
 */
async function fetchDeductedOrderIdsForList(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ctx: Pick<AuthContext, "userId" | "organizationId">,
  orderIds: number[]
): Promise<Set<number>> {
  const deducted = new Set<number>();
  if (orderIds.length === 0) return deducted;

  const chunks: number[][] = [];
  for (let i = 0; i < orderIds.length; i += IN_CHUNK_SIZE) {
    chunks.push(orderIds.slice(i, i + IN_CHUNK_SIZE));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      applyTenantFilter(
        admin
          .from("erp_stock_movements")
          .select("reference_order_id")
          .eq("movement_type", "sale_deduction")
          .in("reference_order_id", chunk),
        ctx
      )
    )
  );

  for (const res of responses) {
    for (const r of (res.data ?? []) as Array<{ reference_order_id: number | null }>) {
      const n = Number(r.reference_order_id);
      if (Number.isFinite(n) && n > 0) deducted.add(n);
    }
  }

  return deducted;
}

/**
 * Busca snapshots históricos congelados em `erp_order_roll_consumptions` em chunks por `ml_order_id`.
 */
async function fetchHistoricalConsumptionsForOrders(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ctx: Pick<AuthContext, "userId" | "organizationId">,
  orderIds: number[]
): Promise<Map<number, ErpOrderRollConsumption[]>> {
  const byOrder = new Map<number, ErpOrderRollConsumption[]>();
  if (orderIds.length === 0) return byOrder;

  const chunks: number[][] = [];
  for (let i = 0; i < orderIds.length; i += IN_CHUNK_SIZE) {
    chunks.push(orderIds.slice(i, i + IN_CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    const res = await applyTenantFilter(
      admin.from("erp_order_roll_consumptions").select("*").in("ml_order_id", chunk),
      ctx
    );
    if (isMissingTableError(res.error)) {
      return byOrder;
    }
    for (const row of (res.data ?? []) as ErpOrderRollConsumption[]) {
      const oid = Number(row.ml_order_id);
      const list = byOrder.get(oid) ?? [];
      list.push(row);
      byOrder.set(oid, list);
    }
  }

  return byOrder;
}

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const thirtyAgo = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);

  const dateFrom = request.nextUrl.searchParams.get("dateFrom") || thirtyAgo;
  const dateTo = request.nextUrl.searchParams.get("dateTo") || defaultTo;
  const { fromIso, toIso } = toDateBounds(dateFrom, dateTo);

  try {
    const workspace = await loadErpWorkspaceData(ctx);
    if (!workspace.schemaReady) {
      return NextResponse.json({
        success: true,
        schemaReady: false,
        dateFrom,
        dateTo,
        items: [],
        rollsSummary: [],
        totals: {
          linkedOrdersCount: 0,
          unlinkedOrdersCount: 0,
          pendingDeductionOrdersCount: 0,
          totalProductCost: 0,
          totalPpfMeters: 0,
          totalPpfAreaM2: 0,
        },
      });
    }

    const admin = createSupabaseAdminClient();
    const orders = await fetchPaginatedValidOrders<{
      id: string;
      ml_order_id: number;
      mlb_id: string;
      product_title: string;
      quantity: number;
      status: string;
      order_date: string;
    }>({
      admin,
      ctx,
      columns: "id, ml_order_id, mlb_id, product_title, quantity, status, order_date",
      fromIso,
      toIso,
      ascending: false,
    });

    const periodOrderIds = Array.from(
      new Set(orders.map((o) => Number(o.ml_order_id)).filter((n) => Number.isFinite(n) && n > 0))
    );

    const [alreadyDeductedOrders, historicalByOrder] = await Promise.all([
      fetchDeductedOrderIdsForList(admin, ctx, periodOrderIds),
      fetchHistoricalConsumptionsForOrders(admin, ctx, periodOrderIds),
    ]);

    const linkByMlb = new Map(
      workspace.links.map((l) => [l.external_listing_id.toUpperCase(), l])
    );
    const rollById = new Map(workspace.rolls.map((r) => [r.id, r]));

    const byMlb = new Map<string, ErpSalesConsumptionItem>();
    const totalByRoll = new Map<string, ErpRollConsumptionSummary>();

    let linkedOrdersCount = 0;
    let unlinkedOrdersCount = 0;
    let pendingDeductionOrdersCount = 0;

    for (const order of orders) {
      const mlb = (order.mlb_id || "").toUpperCase();
      const link = linkByMlb.get(mlb);
      if (!link || !link.product) {
        unlinkedOrdersCount += 1;
        continue;
      }

      linkedOrdersCount += 1;
      const orderNum = Number(order.ml_order_id);
      const isPending = !alreadyDeductedOrders.has(orderNum);
      if (isPending) pendingDeductionOrdersCount += 1;

      const units = Math.max(1, Number(order.quantity || 1)) * Number(link.quantity_per_sale || 1);
      const prod = link.product;
      const histRows = historicalByOrder.get(orderNum);

      let orderRollConsumptions: ErpRollConsumptionSummary[];
      let orderCost: number;
      let orderMeters: number;
      let orderArea: number;

      if (histRows && histRows.length > 0) {
        const histRollCost = round2(
          histRows.reduce((acc, h) => acc + Number(h.total_cost_snapshot || 0), 0)
        );
        const currentRollCost = round2(
          prod.roll_consumptions.reduce((acc, rc) => acc + rc.cost * units, 0)
        );
        const nonPpfCost = Math.max(0, round2(prod.computed_total_cost * units - currentRollCost));

        orderCost = round2(histRollCost + nonPpfCost);
        orderMeters = round6(
          histRows.reduce((acc, h) => acc + Number(h.meters_consumed || 0), 0)
        );
        orderArea = round6(
          histRows.reduce((acc, h) => acc + Number(h.area_m2_consumed || 0), 0)
        );

        const groupedHist = new Map<string, ErpRollConsumptionSummary>();
        for (const h of histRows) {
          const rid = h.ppf_roll_id || "unknown";
          const rollRef = h.ppf_roll_id ? rollById.get(h.ppf_roll_id) : null;
          const rollLen = Math.max(0.01, Number(rollRef?.roll_length_m || 12));
          const cur = groupedHist.get(rid);
          const m = Number(h.meters_consumed || 0);
          const a = Number(h.area_m2_consumed || 0);
          const c = Number(h.total_cost_snapshot || 0);

          if (!cur) {
            groupedHist.set(rid, {
              roll_id: rid,
              roll_code: h.roll_code_snapshot || rollRef?.code || "BOBINA",
              roll_name: h.roll_name_snapshot || rollRef?.name || "Bobina PPF",
              roll_width_cm: Number(rollRef?.roll_width_cm || 152),
              roll_length_m: rollLen,
              cost_per_linear_meter: Number(h.unit_cost_per_meter_snapshot || 0),
              remaining_meters: Number(rollRef?.remaining_meters || 0),
              linear_meters: round6(m),
              area_m2: round6(a),
              cost: round2(c),
              rolls_fraction: round6(m / rollLen),
            });
          } else {
            cur.linear_meters = round6(cur.linear_meters + m);
            cur.area_m2 = round6(cur.area_m2 + a);
            cur.cost = round2(cur.cost + c);
            cur.rolls_fraction = round6(cur.linear_meters / rollLen);
            cur.cost_per_linear_meter =
              cur.linear_meters > 0 ? round2(cur.cost / cur.linear_meters) : cur.cost_per_linear_meter;
          }
        }
        orderRollConsumptions = Array.from(groupedHist.values());
      } else {
        orderCost = round2(prod.computed_total_cost * units);
        orderMeters = round6(prod.computed_total_ppf_meters * units);
        orderArea = round6(prod.computed_total_ppf_area_m2 * units);
        orderRollConsumptions = prod.roll_consumptions.map((rc) => ({
          ...rc,
          linear_meters: round6(rc.linear_meters * units),
          area_m2: round6(rc.area_m2 * units),
          cost: round2(rc.cost * units),
          rolls_fraction: round6(
            (rc.linear_meters * units) / Math.max(0.01, rc.roll_length_m)
          ),
        }));
      }

      const existing = byMlb.get(mlb);
      if (!existing) {
        byMlb.set(mlb, {
          mlb_id: mlb,
          listing_title: order.product_title || link.listing_title || mlb,
          product_id: prod.id,
          product_name: prod.name,
          product_sku: prod.sku,
          product_type: prod.product_type,
          orders_count: 1,
          units_sold: units,
          total_product_cost: orderCost,
          total_ppf_meters: orderMeters,
          total_ppf_area_m2: orderArea,
          pending_deduction_orders: isPending ? 1 : 0,
          roll_consumptions: orderRollConsumptions.map((rc) => ({ ...rc })),
        });
      } else {
        existing.orders_count += 1;
        existing.units_sold = round4(existing.units_sold + units);
        existing.total_product_cost = round2(existing.total_product_cost + orderCost);
        existing.total_ppf_meters = round6(existing.total_ppf_meters + orderMeters);
        existing.total_ppf_area_m2 = round6(existing.total_ppf_area_m2 + orderArea);
        if (isPending) existing.pending_deduction_orders += 1;

        for (const rc of orderRollConsumptions) {
          const match = existing.roll_consumptions.find((r) => r.roll_id === rc.roll_id);
          if (match) {
            match.linear_meters = round6(match.linear_meters + rc.linear_meters);
            match.area_m2 = round6(match.area_m2 + rc.area_m2);
            match.cost = round2(match.cost + rc.cost);
            match.rolls_fraction = round6(
              match.linear_meters / Math.max(0.01, match.roll_length_m)
            );
          } else {
            existing.roll_consumptions.push({ ...rc });
          }
        }
      }

      for (const rc of orderRollConsumptions) {
        const cur = totalByRoll.get(rc.roll_id);
        if (!cur) {
          totalByRoll.set(rc.roll_id, { ...rc });
        } else {
          cur.linear_meters = round6(cur.linear_meters + rc.linear_meters);
          cur.area_m2 = round6(cur.area_m2 + rc.area_m2);
          cur.cost = round2(cur.cost + rc.cost);
          cur.rolls_fraction = round6(cur.linear_meters / Math.max(0.01, cur.roll_length_m));
          cur.cost_per_linear_meter =
            cur.linear_meters > 0 ? round2(cur.cost / cur.linear_meters) : cur.cost_per_linear_meter;
        }
      }
    }

    const items = Array.from(byMlb.values()).sort(
      (a, b) => b.total_ppf_meters - a.total_ppf_meters || b.total_product_cost - a.total_product_cost
    );
    const rollsSummary = Array.from(totalByRoll.values()).sort(
      (a, b) => b.linear_meters - a.linear_meters
    );

    return NextResponse.json({
      success: true,
      schemaReady: true,
      lotsSchemaReady: workspace.lotsSchemaReady ?? false,
      dateFrom,
      dateTo,
      items,
      rollsSummary,
      totals: {
        linkedOrdersCount,
        unlinkedOrdersCount,
        pendingDeductionOrdersCount,
        totalProductCost: round2(items.reduce((acc, i) => acc + i.total_product_cost, 0)),
        totalPpfMeters: round4(items.reduce((acc, i) => acc + i.total_ppf_meters, 0)),
        totalPpfAreaM2: round4(items.reduce((acc, i) => acc + i.total_ppf_area_m2, 0)),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao apurar consumo das vendas.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = deductSalesStockSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Parâmetros inválidos." },
      { status: 400 }
    );
  }

  const { dateFrom, dateTo, deductProducts, deductPpfRolls } = parsed.data;
  const { fromIso, toIso } = toDateBounds(dateFrom, dateTo);

  try {
    const workspace = await loadErpWorkspaceData(ctx);
    const admin = createSupabaseAdminClient();

    // Ordem cronológica estrita (`order_date ASC`) paginada para garantir PEPS fiel sem truncamento
    const orders = await fetchPaginatedValidOrders<{
      id: string;
      ml_order_id: number;
      mlb_id: string;
      quantity: number;
      status: string;
      order_date: string;
      costs_manually_edited: boolean;
    }>({
      admin,
      ctx,
      columns: "id, ml_order_id, mlb_id, quantity, status, order_date, costs_manually_edited",
      fromIso,
      toIso,
      ascending: true,
    });

    const periodOrderIds = Array.from(
      new Set(orders.map((o) => Number(o.ml_order_id)).filter((n) => Number.isFinite(n) && n > 0))
    );

    const [alreadyDeducted, existingConsumptionsMap] = await Promise.all([
      fetchDeductedOrderIdsForList(admin, ctx, periodOrderIds),
      fetchHistoricalConsumptionsForOrders(admin, ctx, periodOrderIds),
    ]);

    for (const oid of Array.from(existingConsumptionsMap.keys())) {
      alreadyDeducted.add(oid);
    }

    const linkByMlb = new Map(
      workspace.links.map((l) => [l.external_listing_id.toUpperCase(), l])
    );
    const rollById = new Map(workspace.rolls.map((r) => [r.id, r]));

    const mutableLotsByRollId = new Map<string, ErpPpfRollLot[]>();
    for (const roll of workspace.rolls) {
      mutableLotsByRollId.set(
        roll.id,
        (roll.lots ?? []).map((l) => ({ ...l }))
      );
    }

    const rollBalances = new Map(
      workspace.rolls.map((r) => [r.id, Number(r.remaining_meters || 0)])
    );
    const productBalances = new Map(
      workspace.products.map((p) => [p.id, Number(p.stock_quantity || 0)])
    );

    const movementsToInsert: Array<Record<string, unknown>> = [];
    const orderConsumptionsToInsert: Array<Record<string, unknown>> = [];
    const orderCostUpdates: Array<{
      id: string;
      cost_material: number;
      cost_packaging: number;
      cost_logistics: number;
      cost_printing: number;
      cost_accessories_kit: number;
      cost_lot_summary: ReturnType<typeof toOrderCostLotSummary>;
    }> = [];

    const touchedRolls = new Set<string>();
    const touchedLotIds = new Set<string>();
    const touchedProducts = new Set<string>();
    let processedOrders = 0;
    const nowIso = new Date().toISOString();

    for (const order of orders) {
      const orderNum = Number(order.ml_order_id);
      if (alreadyDeducted.has(orderNum)) continue;

      const mlb = (order.mlb_id || "").toUpperCase();
      const link = linkByMlb.get(mlb);
      if (!link || !link.product) continue;

      const units = Math.max(1, Number(order.quantity || 1)) * Number(link.quantity_per_sale || 1);
      const prod = link.product;
      let orderTouched = false;
      const orderAllocations: FifoAllocationLine[] = [];

      if (deductPpfRolls && prod.roll_consumptions.length > 0) {
        for (const rc of prod.roll_consumptions) {
          const metersNeeded = round6(rc.linear_meters * units);
          if (metersNeeded <= 0) continue;

          const roll = rollById.get(rc.roll_id);
          const rollLots = mutableLotsByRollId.get(rc.roll_id) ?? [];

          if (workspace.lotsSchemaReady && roll && rollLots.length > 0) {
            const fifo = allocateFifoMetersFromLots({
              mutableLots: rollLots,
              roll,
              metersNeeded,
              nowIso,
            });

            for (const lid of fifo.touchedLotIds) touchedLotIds.add(lid);
            touchedRolls.add(rc.roll_id);
            orderTouched = true;

            for (const alloc of fifo.allocations) {
              orderAllocations.push(alloc);

              const prevTotal = rollBalances.get(rc.roll_id) ?? 0;
              const nextTotal = round4(Math.max(0, prevTotal - alloc.meters));
              rollBalances.set(rc.roll_id, nextTotal);

              movementsToInsert.push({
                organization_id: ctx.organizationId,
                user_id: ctx.userId,
                entity_type: "ppf_roll",
                ppf_roll_id: rc.roll_id,
                ppf_roll_lot_id: alloc.lot_id,
                supplier_id: alloc.supplier_id,
                movement_type: "sale_deduction",
                quantity_delta: round4(-alloc.meters),
                balance_after: nextTotal,
                unit: "M",
                unit_cost: alloc.unit_cost_per_meter,
                total_cost: alloc.total_cost,
                reference_order_id: orderNum,
                reference_mlb_id: mlb,
                reason: `Baixa PEPS venda ML #${orderNum} (${prod.sku}) • Lote ${alloc.lot_code}${
                  alloc.supplier_name ? ` (${alloc.supplier_name})` : ""
                } @ R$ ${alloc.unit_cost_per_meter.toFixed(2)}/m`,
              });

              orderConsumptionsToInsert.push({
                organization_id: ctx.organizationId,
                user_id: ctx.userId,
                ml_order_id: orderNum,
                order_date: order.order_date,
                mlb_id: mlb,
                product_id: prod.id,
                ppf_roll_id: rc.roll_id,
                ppf_roll_lot_id: alloc.lot_id,
                supplier_id: alloc.supplier_id,
                supplier_name_snapshot: alloc.supplier_name,
                lot_code_snapshot: alloc.lot_code,
                roll_code_snapshot: alloc.roll_code,
                roll_name_snapshot: alloc.roll_name,
                meters_consumed: alloc.meters,
                area_m2_consumed: alloc.area_m2,
                unit_cost_per_meter_snapshot: alloc.unit_cost_per_meter,
                total_cost_snapshot: alloc.total_cost,
                source_stage: "deduction",
              });
            }
          } else {
            const delta = round4(-metersNeeded);
            const prev = rollBalances.get(rc.roll_id) ?? 0;
            const next = round4(prev + delta);
            rollBalances.set(rc.roll_id, next);
            touchedRolls.add(rc.roll_id);
            orderTouched = true;

            movementsToInsert.push({
              organization_id: ctx.organizationId,
              user_id: ctx.userId,
              entity_type: "ppf_roll",
              ppf_roll_id: rc.roll_id,
              movement_type: "sale_deduction",
              quantity_delta: delta,
              balance_after: next,
              unit: "M",
              reference_order_id: orderNum,
              reference_mlb_id: mlb,
              reason: `Baixa automática por venda ML #${orderNum} (${prod.sku})`,
            });
          }
        }

        if (orderAllocations.length > 0 && !order.costs_manually_edited) {
          const fifoPpfCost = round2(
            orderAllocations.reduce((acc, a) => acc + a.total_cost, 0)
          );
          const currentPpfCost = round2(
            prod.roll_consumptions.reduce((acc, rc) => acc + rc.cost * units, 0)
          );
          const nonPpfMaterialCost = Math.max(
            0,
            round2(prod.computed_cost_breakdown.material_cost * units - currentPpfCost)
          );
          const b = prod.computed_cost_breakdown;

          orderCostUpdates.push({
            id: order.id,
            cost_material: round2(fifoPpfCost + nonPpfMaterialCost),
            cost_packaging: round2(b.packaging_cost * Number(link.quantity_per_sale || 1)),
            cost_logistics: round2(b.logistics_cost * Number(link.quantity_per_sale || 1)),
            cost_printing: round2(b.printing_cost * Number(link.quantity_per_sale || 1)),
            cost_accessories_kit: round2(b.accessories_kit_cost * units),
            cost_lot_summary: toOrderCostLotSummary(orderAllocations),
          });
        }
      }

      if (deductProducts) {
        if (prod.product_type === "kit" && prod.kit_items && prod.kit_items.length > 0) {
          for (const item of prod.kit_items) {
            if (!item.component) continue;
            if (item.component.uses_ppf_roll && deductPpfRolls) continue;
            const delta = round4(-(item.quantity * units));
            const prev = productBalances.get(item.component.id) ?? 0;
            const next = round4(prev + delta);
            productBalances.set(item.component.id, next);
            touchedProducts.add(item.component.id);
            orderTouched = true;

            movementsToInsert.push({
              organization_id: ctx.organizationId,
              user_id: ctx.userId,
              entity_type: "product",
              product_id: item.component.id,
              movement_type: "sale_deduction",
              quantity_delta: delta,
              balance_after: next,
              unit: item.component.unit || "UN",
              reference_order_id: orderNum,
              reference_mlb_id: mlb,
              reason: `Baixa por venda ML #${orderNum} (Kit ${prod.sku})`,
            });
          }
        } else if (prod.product_type !== "kit" && !(prod.uses_ppf_roll && deductPpfRolls)) {
          const delta = round4(-units);
          const prev = productBalances.get(prod.id) ?? 0;
          const next = round4(prev + delta);
          productBalances.set(prod.id, next);
          touchedProducts.add(prod.id);
          orderTouched = true;

          movementsToInsert.push({
            organization_id: ctx.organizationId,
            user_id: ctx.userId,
            entity_type: "product",
            product_id: prod.id,
            movement_type: "sale_deduction",
            quantity_delta: delta,
            balance_after: next,
            unit: prod.unit || "UN",
            reference_order_id: orderNum,
            reference_mlb_id: mlb,
            reason: `Baixa por venda ML #${orderNum} (${prod.sku})`,
          });
        }
      }

      if (orderTouched) {
        processedOrders += 1;
        alreadyDeducted.add(orderNum);
      }
    }

    // 1. Insere PRIMEIRO o ledger imutável (`erp_order_roll_consumptions`) como barreira atômica anti-duplicidade:
    // Se outra requisição concorrente já baixou estes pedidos (erro 23505 unique_violation), aborta antes de descontar metros em dobro!
    if (workspace.lotsSchemaReady && orderConsumptionsToInsert.length > 0) {
      for (let i = 0; i < orderConsumptionsToInsert.length; i += 200) {
        const chunk = orderConsumptionsToInsert.slice(i, i + 200);
        const { error: consErr } = await admin
          .from("erp_order_roll_consumptions")
          .insert(chunk);

        if (consErr) {
          if (consErr.code === "23505") {
            return NextResponse.json(
              {
                success: false,
                error:
                  "Uma baixa simultânea já processou parte destes pedidos. Atualize a tela para visualizar os saldos atualizados.",
              },
              { status: 409 }
            );
          }
          throw new Error(consErr.message);
        }
      }
    }

    // 2. Persiste lotes PEPS respeitando `uq_erp_ppf_roll_lots_single_in_use`:
    // Atualiza primeiro lotes que SAÍRAM de `in_use` (`exhausted`/`queued`) e por último o lote promovido para `in_use`!
    if (workspace.lotsSchemaReady && touchedLotIds.size > 0) {
      for (const rollId of Array.from(touchedRolls)) {
        const lots = (mutableLotsByRollId.get(rollId) ?? [])
          .filter((l) => touchedLotIds.has(l.id))
          .sort((a, b) => (a.status === "in_use" ? 1 : 0) - (b.status === "in_use" ? 1 : 0));

        for (const lot of lots) {
          await applyTenantFilter(
            admin
              .from("erp_ppf_roll_lots")
              .update({
                remaining_meters: lot.remaining_meters,
                status: lot.status,
                started_using_at: lot.started_using_at,
                exhausted_at: lot.exhausted_at,
              })
              .eq("id", lot.id),
            ctx
          );
        }
        await syncRollSummaryAndCurrentProductCosts(ctx, rollId);
      }
    } else {
      await Promise.all(
        Array.from(touchedRolls).map((rollId) =>
          admin
            .from("erp_ppf_rolls")
            .update({ remaining_meters: rollBalances.get(rollId) ?? 0 })
            .eq("id", rollId)
        )
      );
    }

    // 3. Persiste estoque de produtos simples em batches paralelos
    const touchedProductsArr = Array.from(touchedProducts);
    for (let i = 0; i < touchedProductsArr.length; i += UPDATE_CONCURRENCY) {
      const batch = touchedProductsArr.slice(i, i + UPDATE_CONCURRENCY);
      await Promise.all(
        batch.map((productId) =>
          admin
            .from("erp_products")
            .update({ stock_quantity: productBalances.get(productId) ?? 0 })
            .eq("id", productId)
        )
      );
    }

    // 4. Congela os custos reais PEPS em `ml_sales_orders` em batches paralelos de 20 (elimina N+1!)
    let snapshotColumnsExist = true;
    for (let i = 0; i < orderCostUpdates.length; i += UPDATE_CONCURRENCY) {
      const batch = orderCostUpdates.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        batch.map((upd) => {
          const payload: Record<string, unknown> = {
            cost_material: upd.cost_material,
            cost_packaging: upd.cost_packaging,
            cost_logistics: upd.cost_logistics,
            cost_printing: upd.cost_printing,
            cost_accessories_kit: upd.cost_accessories_kit,
          };
          if (snapshotColumnsExist) {
            payload.cost_snapshot_locked = true;
            payload.cost_snapshot_locked_at = nowIso;
            payload.cost_snapshot_source = "ppf_lot_fifo";
            payload.cost_lot_summary = upd.cost_lot_summary;
          }
          return admin.from("ml_sales_orders").update(payload).eq("id", upd.id);
        })
      );

      if (snapshotColumnsExist && results.some((r) => r.error && isMissingColumnError(r.error))) {
        snapshotColumnsExist = false;
        await Promise.all(
          batch.map((upd) =>
            admin
              .from("ml_sales_orders")
              .update({
                cost_material: upd.cost_material,
                cost_packaging: upd.cost_packaging,
                cost_logistics: upd.cost_logistics,
                cost_printing: upd.cost_printing,
                cost_accessories_kit: upd.cost_accessories_kit,
              })
              .eq("id", upd.id)
          )
        );
      }
    }

    // 5. Insere Kardex valorizado em chunks de 200
    if (movementsToInsert.length > 0) {
      for (let i = 0; i < movementsToInsert.length; i += 200) {
        const chunk = movementsToInsert.slice(i, i + 200);
        await admin.from("erp_stock_movements").insert(chunk);
      }
    }

    return NextResponse.json({
      success: true,
      processedOrders,
      movementsCreated: movementsToInsert.length,
      rollsUpdated: touchedRolls.size,
      productsUpdated: touchedProducts.size,
      lotsUpdated: touchedLotIds.size,
      ordersCostLocked: orderCostUpdates.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao realizar baixa em lote das vendas.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
