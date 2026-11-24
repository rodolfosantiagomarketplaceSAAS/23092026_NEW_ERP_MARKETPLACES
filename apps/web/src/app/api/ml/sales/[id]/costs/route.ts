import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { updateOrderCostsSchema } from "@/lib/validators/ml-sales";
import { applyTenantFilter, upsertTenantCostTemplate } from "@/lib/mercadolivre/tenant-scope";
import { roundCurrency } from "@/lib/mercadolivre/sales-analytics";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Não autenticado." },
      { status: 401 }
    );
  }

  const orderId = context.params.id;
  if (!orderId) {
    return NextResponse.json(
      { success: false, error: "ID do pedido não informado." },
      { status: 400 }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = updateOrderCostsSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message || "Valores de custo inválidos.",
      },
      { status: 400 }
    );
  }

  const {
    tax_pct,
    cost_material,
    cost_packaging,
    cost_logistics,
    cost_printing,
    cost_accessories_kit,
    saveAsMlbTemplate,
  } = parsed.data;

  try {
    const admin = createSupabaseAdminClient();

    const updateQuery = applyTenantFilter(
      admin
        .from("ml_sales_orders")
        .update({
          tax_pct: roundCurrency(tax_pct),
          cost_material: roundCurrency(cost_material),
          cost_packaging: roundCurrency(cost_packaging),
          cost_logistics: roundCurrency(cost_logistics),
          cost_printing: roundCurrency(cost_printing),
          cost_accessories_kit: roundCurrency(cost_accessories_kit),
          costs_manually_edited: true,
        })
        .eq("id", orderId)
        .select("*"),
      ctx
    );

    const { data: updated, error } = await updateQuery.single();
    if (error || !updated) {
      throw new Error(error?.message || "Pedido não encontrado para atualizar custos.");
    }

    let savedTemplate = null;
    if (saveAsMlbTemplate && updated.mlb_id) {
      const qty = Math.max(1, Number(updated.quantity || 1));
      savedTemplate = await upsertTenantCostTemplate(ctx, {
        mlb_id: String(updated.mlb_id),
        sku: updated.sku ? String(updated.sku) : undefined,
        material_cost: roundCurrency(cost_material / qty),
        packaging_cost: roundCurrency(cost_packaging),
        logistics_cost: roundCurrency(cost_logistics),
        printing_cost: roundCurrency(cost_printing),
        accessories_kit_cost: roundCurrency(cost_accessories_kit / qty),
        default_tax_pct: roundCurrency(tax_pct),
      });
    }

    return NextResponse.json({
      success: true,
      order: updated,
      savedTemplate,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao atualizar custos operacionais do pedido.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

