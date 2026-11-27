import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter } from "@/lib/mercadolivre/tenant-scope";
import { loadErpWorkspaceData } from "@/lib/erp/erp-repository";
import { deductSalesStockSchema } from "@/lib/validators/erp-products";
import { round2, round4, round6 } from "@/lib/erp/ppf-calculator";
import type {
  ErpRollConsumptionSummary,
  ErpSalesConsumptionItem,
} from "@/types/erp-products";

export const dynamic = "force-dynamic";

function toDateBounds(dateFrom: string, dateTo: string) {
  const fromIso = `${dateFrom.slice(0, 10)}T00:00:00-03:00`;
  const toIso = `${dateTo.slice(0, 10)}T23:59:59-03:00`;
  return { fromIso, toIso };
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
    const [ordersRes, deductedMovsRes] = await Promise.all([
      applyTenantFilter(
        admin
          .from("ml_sales_orders")
          .select("id, ml_order_id, mlb_id, product_title, quantity, status, order_date")
          .gte("order_date", fromIso)
          .lte("order_date", toIso)
          .not("status", "in", "(cancelled,returned)"),
        ctx
      ),
      applyTenantFilter(
        admin
          .from("erp_stock_movements")
          .select("reference_order_id")
          .eq("movement_type", "sale_deduction")
          .not("reference_order_id", "is", null),
        ctx
      ),
    ]);

    const orders = (ordersRes.data ?? []) as Array<{
      id: string;
      ml_order_id: number;
      mlb_id: string;
      product_title: string;
      quantity: number;
      status: string;
      order_date: string;
    }>;

    const alreadyDeductedOrders = new Set<number>(
      ((deductedMovsRes.data ?? []) as Array<{ reference_order_id: number | null }>)
        .map((r) => Number(r.reference_order_id))
        .filter((n) => Number.isFinite(n) && n > 0)
    );

    const linkByMlb = new Map(
      workspace.links.map((l) => [l.external_listing_id.toUpperCase(), l])
    );

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
      const isPending = !alreadyDeductedOrders.has(Number(order.ml_order_id));
      if (isPending) pendingDeductionOrdersCount += 1;

      const units = Math.max(1, Number(order.quantity || 1)) * Number(link.quantity_per_sale || 1);
      const prod = link.product;
      const orderCost = round2(prod.computed_total_cost * units);
      const orderMeters = round6(prod.computed_total_ppf_meters * units);
      const orderArea = round6(prod.computed_total_ppf_area_m2 * units);

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
          roll_consumptions: prod.roll_consumptions.map((rc) => ({
            ...rc,
            linear_meters: round6(rc.linear_meters * units),
            area_m2: round6(rc.area_m2 * units),
            cost: round2(rc.cost * units),
            rolls_fraction: round6(
              (rc.linear_meters * units) / Math.max(0.01, rc.roll_length_m)
            ),
          })),
        });
      } else {
        existing.orders_count += 1;
        existing.units_sold = round4(existing.units_sold + units);
        existing.total_product_cost = round2(existing.total_product_cost + orderCost);
        existing.total_ppf_meters = round6(existing.total_ppf_meters + orderMeters);
        existing.total_ppf_area_m2 = round6(existing.total_ppf_area_m2 + orderArea);
        if (isPending) existing.pending_deduction_orders += 1;

        for (const rc of prod.roll_consumptions) {
          const match = existing.roll_consumptions.find((r) => r.roll_id === rc.roll_id);
          if (match) {
            match.linear_meters = round6(match.linear_meters + rc.linear_meters * units);
            match.area_m2 = round6(match.area_m2 + rc.area_m2 * units);
            match.cost = round2(match.cost + rc.cost * units);
            match.rolls_fraction = round6(
              match.linear_meters / Math.max(0.01, match.roll_length_m)
            );
          } else {
            existing.roll_consumptions.push({
              ...rc,
              linear_meters: round6(rc.linear_meters * units),
              area_m2: round6(rc.area_m2 * units),
              cost: round2(rc.cost * units),
              rolls_fraction: round6(
                (rc.linear_meters * units) / Math.max(0.01, rc.roll_length_m)
              ),
            });
          }
        }
      }

      for (const rc of prod.roll_consumptions) {
        const cur = totalByRoll.get(rc.roll_id);
        const addM = rc.linear_meters * units;
        const addA = rc.area_m2 * units;
        const addC = rc.cost * units;
        if (!cur) {
          totalByRoll.set(rc.roll_id, {
            ...rc,
            linear_meters: round6(addM),
            area_m2: round6(addA),
            cost: round2(addC),
            rolls_fraction: round6(addM / Math.max(0.01, rc.roll_length_m)),
          });
        } else {
          cur.linear_meters = round6(cur.linear_meters + addM);
          cur.area_m2 = round6(cur.area_m2 + addA);
          cur.cost = round2(cur.cost + addC);
          cur.rolls_fraction = round6(cur.linear_meters / Math.max(0.01, cur.roll_length_m));
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

    const [ordersRes, deductedMovsRes] = await Promise.all([
      applyTenantFilter(
        admin
          .from("ml_sales_orders")
          .select("id, ml_order_id, mlb_id, quantity, status")
          .gte("order_date", fromIso)
          .lte("order_date", toIso)
          .not("status", "in", "(cancelled,returned)"),
        ctx
      ),
      applyTenantFilter(
        admin
          .from("erp_stock_movements")
          .select("reference_order_id")
          .eq("movement_type", "sale_deduction")
          .not("reference_order_id", "is", null),
        ctx
      ),
    ]);

    const alreadyDeducted = new Set<number>(
      ((deductedMovsRes.data ?? []) as Array<{ reference_order_id: number | null }>)
        .map((r) => Number(r.reference_order_id))
        .filter((n) => Number.isFinite(n) && n > 0)
    );

    const linkByMlb = new Map(
      workspace.links.map((l) => [l.external_listing_id.toUpperCase(), l])
    );

    // Saldos mutáveis em memória para atualizar em lote com precisão
    const rollBalances = new Map(
      workspace.rolls.map((r) => [r.id, Number(r.remaining_meters || 0)])
    );
    const productBalances = new Map(
      workspace.products.map((p) => [p.id, Number(p.stock_quantity || 0)])
    );

    const movementsToInsert: Array<Record<string, unknown>> = [];
    const touchedRolls = new Set<string>();
    const touchedProducts = new Set<string>();
    let processedOrders = 0;

    for (const order of (ordersRes.data ?? []) as Array<{
      ml_order_id: number;
      mlb_id: string;
      quantity: number;
    }>) {
      const orderNum = Number(order.ml_order_id);
      if (alreadyDeducted.has(orderNum)) continue;

      const mlb = (order.mlb_id || "").toUpperCase();
      const link = linkByMlb.get(mlb);
      if (!link || !link.product) continue;

      const units = Math.max(1, Number(order.quantity || 1)) * Number(link.quantity_per_sale || 1);
      const prod = link.product;
      let orderTouched = false;

      if (deductPpfRolls && prod.roll_consumptions.length > 0) {
        for (const rc of prod.roll_consumptions) {
          const delta = round4(-(rc.linear_meters * units));
          if (delta === 0) continue;
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

      if (deductProducts) {
        if (prod.product_type === "kit" && prod.kit_items && prod.kit_items.length > 0) {
          for (const item of prod.kit_items) {
            if (!item.component) continue;
            // Se o componente usa bobina PPF e já baixamos bobina, só baixa estoque físico se tiver saldo > 0
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

    for (const rollId of Array.from(touchedRolls)) {
      await admin
        .from("erp_ppf_rolls")
        .update({ remaining_meters: rollBalances.get(rollId) ?? 0 })
        .eq("id", rollId);
    }

    for (const productId of Array.from(touchedProducts)) {
      await admin
        .from("erp_products")
        .update({ stock_quantity: productBalances.get(productId) ?? 0 })
        .eq("id", productId);
    }

    if (movementsToInsert.length > 0) {
      await admin.from("erp_stock_movements").insert(movementsToInsert);
    }

    return NextResponse.json({
      success: true,
      processedOrders,
      movementsCreated: movementsToInsert.length,
      rollsUpdated: touchedRolls.size,
      productsUpdated: touchedProducts.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao realizar baixa em lote das vendas.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
