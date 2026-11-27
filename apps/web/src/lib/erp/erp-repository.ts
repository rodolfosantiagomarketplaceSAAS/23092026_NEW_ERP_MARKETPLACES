import type { AuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  applyTenantFilter,
  isMissingColumnError,
  isMissingTableError,
  upsertTenantCostTemplate,
} from "@/lib/mercadolivre/tenant-scope";
import { buildEnrichedErpProducts, round2 } from "@/lib/erp/ppf-calculator";
import { getCurrentActiveLot, sortRollLotsFifo } from "@/lib/erp/ppf-fifo-engine";
import type {
  ErpListingLink,
  ErpOverviewResponse,
  ErpPpfRoll,
  ErpPpfRollLot,
  ErpProduct,
  ErpProductWithSummary,
  ErpStockMovement,
  ErpSupplier,
} from "@/types/erp-products";

export async function loadErpWorkspaceData(
  ctx: Pick<AuthContext, "userId" | "organizationId">
): Promise<ErpOverviewResponse> {
  const admin = createSupabaseAdminClient();

  const [rollsRes, productsRes, kitItemsRes, linksRes, movementsRes, suppliersRes, rollLotsRes] =
    await Promise.all([
      applyTenantFilter(
        admin.from("erp_ppf_rolls").select("*").order("created_at", { ascending: false }),
        ctx
      ),
      applyTenantFilter(
        admin.from("erp_products").select("*").order("updated_at", { ascending: false }),
        ctx
      ),
      applyTenantFilter(
        admin.from("erp_kit_items").select("*").order("sort_order", { ascending: true }),
        ctx
      ),
      applyTenantFilter(
        admin.from("erp_listing_links").select("*").order("updated_at", { ascending: false }),
        ctx
      ),
      applyTenantFilter(
        admin
          .from("erp_stock_movements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(120),
        ctx
      ),
      applyTenantFilter(
        admin.from("erp_suppliers").select("*").order("trade_name", { ascending: true }),
        ctx
      ),
      applyTenantFilter(
        admin.from("erp_ppf_roll_lots").select("*").order("purchase_date", { ascending: true }),
        ctx
      ),
    ]);

  if (
    isMissingTableError(rollsRes.error) ||
    isMissingTableError(productsRes.error) ||
    isMissingTableError(kitItemsRes.error) ||
    isMissingTableError(linksRes.error)
  ) {
    return {
      success: true,
      schemaReady: false,
      suppliersSchemaReady: false,
      lotsSchemaReady: false,
      suppliers: [],
      rolls: [],
      rollLots: [],
      products: [],
      links: [],
      movements: [],
      kpis: {
        totalProducts: 0,
        totalSimple: 0,
        totalPpfPieces: 0,
        totalKits: 0,
        lowStockCount: 0,
        totalRolls: 0,
        totalRemainingRollMeters: 0,
        lowRollCount: 0,
        totalLinkedListings: 0,
        totalSuppliers: 0,
        inventoryValue: 0,
      },
    };
  }

  const suppliersSchemaReady = !isMissingTableError(suppliersRes.error);
  const lotsSchemaReady = !isMissingTableError(rollLotsRes.error);
  const rawSuppliers = suppliersSchemaReady ? ((suppliersRes.data ?? []) as ErpSupplier[]) : [];
  const rawRolls = (rollsRes.data ?? []) as ErpPpfRoll[];
  const rawRollLots = lotsSchemaReady ? ((rollLotsRes.data ?? []) as ErpPpfRollLot[]) : [];
  const rawProducts = (productsRes.data ?? []) as ErpProduct[];

  const supplierById = new Map(rawSuppliers.map((s) => [s.id, s]));

  const enrichedLots: ErpPpfRollLot[] = rawRollLots.map((l) => ({
    ...l,
    supplier_ref: l.supplier_id ? supplierById.get(l.supplier_id) ?? null : null,
  }));
  const lotById = new Map(enrichedLots.map((l) => [l.id, l]));
  const lotsByRollId = new Map<string, ErpPpfRollLot[]>();
  for (const lot of enrichedLots) {
    const list = lotsByRollId.get(lot.ppf_roll_id) ?? [];
    list.push(lot);
    lotsByRollId.set(lot.ppf_roll_id, list);
  }

  const productsCountBySupplier = new Map<string, number>();
  for (const p of rawProducts) {
    if (p.supplier_id) {
      productsCountBySupplier.set(
        p.supplier_id,
        (productsCountBySupplier.get(p.supplier_id) ?? 0) + 1
      );
    }
  }

  const rollsCountBySupplier = new Map<string, number>();
  for (const r of rawRolls) {
    if (r.supplier_id) {
      rollsCountBySupplier.set(
        r.supplier_id,
        (rollsCountBySupplier.get(r.supplier_id) ?? 0) + 1
      );
    }
  }

  const suppliers: ErpSupplier[] = rawSuppliers.map((s) => ({
    ...s,
    linked_products_count: productsCountBySupplier.get(s.id) ?? 0,
    linked_rolls_count: rollsCountBySupplier.get(s.id) ?? 0,
  }));

  const rolls: ErpPpfRoll[] = rawRolls.map((r) => {
    const rollLots = sortRollLotsFifo(lotsByRollId.get(r.id) ?? []);
    const activeLot = getCurrentActiveLot(rollLots);
    const queuedLots = rollLots.filter((l) => l.status === "queued" && Number(l.remaining_meters) > 0);
    const totalQueuedMeters = round2(
      queuedLots.reduce((acc, l) => acc + Math.max(0, Number(l.remaining_meters || 0)), 0)
    );
    const totalLotsRemaining =
      rollLots.length > 0
        ? round2(
            rollLots
              .filter((l) => l.status === "in_use" || l.status === "queued")
              .reduce((acc, l) => acc + Math.max(0, Number(l.remaining_meters || 0)), 0)
          )
        : Number(r.remaining_meters || 0);

    return {
      ...r,
      cost_per_linear_meter: activeLot
        ? round2(Number(activeLot.cost_per_linear_meter))
        : Number(r.cost_per_linear_meter),
      remaining_meters: totalLotsRemaining,
      supplier_ref: r.supplier_id ? supplierById.get(r.supplier_id) ?? null : null,
      lots: rollLots,
      active_lot: activeLot,
      queued_lots_count: queuedLots.length,
      total_queued_meters: totalQueuedMeters,
    };
  });
  const rawKitItems = (kitItemsRes.data ?? []) as Array<{
    id: string;
    kit_product_id: string;
    component_product_id: string;
    quantity: number;
    sort_order: number;
    notes: string | null;
  }>;
  const rawLinks = (linksRes.data ?? []) as ErpListingLink[];

  const linkedCounts = new Map<string, number>();
  for (const link of rawLinks) {
    linkedCounts.set(link.product_id, (linkedCounts.get(link.product_id) ?? 0) + 1);
  }

  const enrichedProducts = buildEnrichedErpProducts(
    rawProducts,
    rolls,
    rawKitItems,
    linkedCounts
  ).map((p) => ({
    ...p,
    supplier_ref: p.supplier_id ? supplierById.get(p.supplier_id) ?? null : null,
  }));
  const productById = new Map(enrichedProducts.map((p) => [p.id, p]));
  const rollById = new Map(rolls.map((r) => [r.id, r]));

  const links: ErpListingLink[] = rawLinks.map((l) => ({
    ...l,
    product: productById.get(l.product_id) ?? null,
  }));

  const rawMovements = (movementsRes.data ?? []) as ErpStockMovement[];
  const movements: ErpStockMovement[] = rawMovements.map((m) => {
    const prod = m.product_id ? productById.get(m.product_id) : null;
    const roll = m.ppf_roll_id ? rollById.get(m.ppf_roll_id) : null;
    const lot = m.ppf_roll_lot_id ? lotById.get(m.ppf_roll_lot_id) : null;
    return {
      ...m,
      product_name: prod?.name ?? null,
      product_sku: prod?.sku ?? null,
      roll_name: roll?.name ?? null,
      roll_code: roll?.code ?? null,
      lot_code: lot?.lot_code ?? null,
    };
  });

  const activeProducts = enrichedProducts.filter((p) => p.status !== "inactive");
  const activeRolls = rolls.filter((r) => r.active);

  // Valorização contábil real por lote PEPS em estoque (cada bobina pelo preço que foi paga!)
  const rollsInventoryValue = activeRolls.reduce((acc, r) => {
    if (r.lots && r.lots.length > 0) {
      return (
        acc +
        r.lots
          .filter((l) => l.status === "in_use" || l.status === "queued")
          .reduce(
            (sum, l) =>
              sum + Math.max(0, Number(l.remaining_meters || 0)) * Number(l.cost_per_linear_meter || 0),
            0
          )
      );
    }
    const rem = Math.max(0, Number(r.remaining_meters || 0));
    return acc + rem * Number(r.cost_per_linear_meter || 0);
  }, 0);

  const inventoryValue = round2(
    activeProducts.reduce((acc, p) => {
      if (p.product_type === "kit") return acc;
      const qty = Math.max(0, Number(p.stock_quantity || 0));
      return acc + qty * p.computed_total_cost;
    }, 0) + rollsInventoryValue
  );

  return {
    success: true,
    schemaReady: true,
    suppliersSchemaReady,
    lotsSchemaReady,
    suppliers,
    rolls,
    rollLots: enrichedLots,
    products: enrichedProducts,
    links,
    movements,
    kpis: {
      totalProducts: enrichedProducts.length,
      totalSimple: enrichedProducts.filter((p) => p.product_type === "simple").length,
      totalPpfPieces: enrichedProducts.filter((p) => p.product_type === "ppf_piece").length,
      totalKits: enrichedProducts.filter((p) => p.product_type === "kit").length,
      lowStockCount: activeProducts.filter(
        (p) =>
          p.product_type !== "kit" &&
          Number(p.min_stock_quantity || 0) > 0 &&
          Number(p.stock_quantity || 0) <= Number(p.min_stock_quantity || 0)
      ).length,
      totalRolls: activeRolls.length,
      totalRemainingRollMeters: round2(
        activeRolls.reduce((acc, r) => acc + Math.max(0, Number(r.remaining_meters || 0)), 0)
      ),
      lowRollCount: activeRolls.filter(
        (r) => Number(r.remaining_meters || 0) <= Number(r.min_alert_meters || 0)
      ).length,
      totalLinkedListings: links.length,
      totalSuppliers: suppliers.filter((s) => s.active).length,
      inventoryValue,
    },
  };
}

/**
 * Sincroniza o custo calculado de um produto/kit vinculado a um anúncio MLB
 * para `product_cost_templates` e, opcionalmente, para pedidos ainda não editados manualmente.
 */
export async function syncLinkCostsToSalesTemplate(
  ctx: Pick<AuthContext, "userId" | "organizationId">,
  params: {
    externalListingId: string;
    listingSku?: string | null;
    quantityPerSale: number;
    product: ErpProductWithSummary;
    applyToUneditedOrders?: boolean;
  }
): Promise<{ templateUpdated: boolean; ordersUpdated: number }> {
  const qty = Math.max(0.001, Number(params.quantityPerSale || 1));
  const b = params.product.computed_cost_breakdown;

  const materialCost = round2(b.material_cost * qty);
  const packagingCost = round2(b.packaging_cost * qty);
  const accessoriesCost = round2(b.accessories_kit_cost * qty);
  const printingCost = round2(b.printing_cost * qty);
  const logisticsCost = round2(b.logistics_cost * qty);

  const template = await upsertTenantCostTemplate(ctx, {
    mlb_id: params.externalListingId,
    sku: params.listingSku || params.product.sku,
    material_cost: materialCost,
    packaging_cost: packagingCost,
    accessories_kit_cost: accessoriesCost,
    printing_cost: printingCost,
    logistics_cost: logisticsCost,
  });

  let ordersUpdated = 0;

  if (params.applyToUneditedOrders) {
    const admin = createSupabaseAdminClient();
    // Proteção Histórica: aplica SOMENTE em pedidos sem custo congelado (`cost_snapshot_locked = false`)
    let ordersRes = await applyTenantFilter(
      admin
        .from("ml_sales_orders")
        .select("id, quantity")
        .eq("mlb_id", template.mlb_id)
        .eq("costs_manually_edited", false)
        .eq("cost_snapshot_locked", false),
      ctx
    );

    if (ordersRes.error && isMissingColumnError(ordersRes.error, "cost_snapshot_locked")) {
      ordersRes = await applyTenantFilter(
        admin
          .from("ml_sales_orders")
          .select("id, quantity")
          .eq("mlb_id", template.mlb_id)
          .eq("costs_manually_edited", false)
          .eq("cost_material", 0),
        ctx
      );
    }

    for (const ord of ordersRes.data ?? []) {
      const ordQty = Math.max(1, Number(ord.quantity || 1));
      const { error } = await admin
        .from("ml_sales_orders")
        .update({
          cost_material: round2(materialCost * ordQty),
          cost_packaging: packagingCost,
          cost_logistics: logisticsCost,
          cost_printing: printingCost,
          cost_accessories_kit: round2(accessoriesCost * ordQty),
        })
        .eq("id", ord.id);

      if (!error) ordersUpdated += 1;
    }
  }

  return { templateUpdated: true, ordersUpdated };
}
