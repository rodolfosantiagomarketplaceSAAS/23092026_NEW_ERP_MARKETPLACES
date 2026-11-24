import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { batchAssignOrdersSchema } from "@/lib/validators/ml-sales";
import { applyTenantFilter, upsertTenantCostTemplate } from "@/lib/mercadolivre/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/ml/sales/assign
 * Atribuição individual (1 clique) ou em massa (Batch Action) de vendedor,
 * marcação de "Verificado" pelo gestor e regra opcional "Salvar como padrão para este anúncio (MLB)".
 */
export async function PATCH(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Não autenticado." },
      { status: 401 }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = batchAssignOrdersSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message || "Dados inválidos para atribuição.",
      },
      { status: 400 }
    );
  }

  const {
    orderIds,
    assignedSellerId,
    updateSellerAssignment,
    markVerified,
    saveDefaultForMlb,
  } = parsed.data;

  const updateFields: Record<string, unknown> = {};
  if (updateSellerAssignment) {
    updateFields.assigned_seller_id = assignedSellerId ?? null;
  }
  if (markVerified !== undefined) {
    updateFields.verified_at = markVerified ? new Date().toISOString() : null;
  }

  if (Object.keys(updateFields).length === 0 && !saveDefaultForMlb) {
    return NextResponse.json(
      { success: false, error: "Nenhuma alteração solicitada." },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    let updatedOrders: unknown[] = [];

    if (Object.keys(updateFields).length > 0) {
      const query = applyTenantFilter(
        admin
          .from("ml_sales_orders")
          .update(updateFields)
          .in("id", orderIds)
          .select("*"),
        ctx
      );
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      updatedOrders = data ?? [];
    }

    // Se solicitado, salva o vendedor como padrão automático para o anúncio MLB e vincula pendentes do mesmo MLB
    let savedTemplate = null;
    if (saveDefaultForMlb && updateSellerAssignment) {
      const normalizedMlb = saveDefaultForMlb.trim().toUpperCase();
      savedTemplate = await upsertTenantCostTemplate(ctx, {
        mlb_id: normalizedMlb,
        default_seller_id: assignedSellerId ?? null,
      });

      if (assignedSellerId) {
        await applyTenantFilter(
          admin
            .from("ml_sales_orders")
            .update({ assigned_seller_id: assignedSellerId })
            .eq("mlb_id", normalizedMlb)
            .is("assigned_seller_id", null),
          ctx
        );
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: updatedOrders.length,
      orders: updatedOrders,
      savedTemplate,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao atualizar atribuição de pedidos.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

