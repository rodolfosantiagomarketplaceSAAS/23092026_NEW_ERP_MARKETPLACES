import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { batchAssignOrdersSchema } from "@/lib/validators/ml-sales";
import { normalizeManualShippedAtInput } from "@/lib/mercadolivre/shipment-extraction";
import {
  applyTenantFilter,
  isMissingColumnError,
  upsertTenantCostTemplate,
} from "@/lib/mercadolivre/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/ml/sales/assign
 * Atribuição individual (1 clique) ou em massa (Batch Action) de vendedor,
 * marcação de "Verificado", regra "Salvar como padrão para este anúncio (MLB)",
 * e definição manual / em lote da Data de Envio (`shipped_at`) com proteção contra sobrescrita da API
 * + opção de reversão em 1 clique para o timestamp oficial da API do Mercado Livre (`api_shipped_at`).
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
        error: parsed.error.issues[0]?.message || "Dados inválidos para atualização.",
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
    updateShippedAt,
    shippedAt,
    revertShippedAtToApi,
  } = parsed.data;

  const updateFields: Record<string, unknown> = {};
  if (updateSellerAssignment) {
    updateFields.assigned_seller_id = assignedSellerId ?? null;
  }
  if (markVerified !== undefined) {
    updateFields.verified_at = markVerified ? new Date().toISOString() : null;
  }

  let normalizedManualShippedAt: string | null = null;
  if (updateShippedAt && !revertShippedAtToApi) {
    if (shippedAt && shippedAt.trim().length > 0) {
      normalizedManualShippedAt = normalizeManualShippedAtInput(shippedAt);
      if (!normalizedManualShippedAt) {
        return NextResponse.json(
          { success: false, error: "Data de envio inválida." },
          { status: 400 }
        );
      }
    }
    updateFields.shipped_at = normalizedManualShippedAt;
    updateFields.shipped_at_manual = Boolean(normalizedManualShippedAt);
  }

  if (
    Object.keys(updateFields).length === 0 &&
    !saveDefaultForMlb &&
    !revertShippedAtToApi
  ) {
    return NextResponse.json(
      { success: false, error: "Nenhuma alteração solicitada." },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    let updatedOrders: unknown[] = [];

    if (revertShippedAtToApi) {
      // Restaura cada pedido para o valor original sincronizado pela API do Mercado Livre (api_shipped_at)
      const existingRes = await applyTenantFilter(
        admin
          .from("ml_sales_orders")
          .select("id, api_shipped_at, shipped_at")
          .in("id", orderIds),
        ctx
      );

      if (existingRes.error && isMissingColumnError(existingRes.error, "api_shipped_at")) {
        // Fallback gracioso caso a migration 20261125150000 ainda não tenha sido rodada no Supabase
        const fallbackUpdate: Record<string, unknown> = {
          ...updateFields,
          shipped_at: null,
        };
        delete fallbackUpdate.shipped_at_manual;
        const { data, error } = await applyTenantFilter(
          admin.from("ml_sales_orders").update(fallbackUpdate).in("id", orderIds).select("*"),
          ctx
        );
        if (error) throw new Error(error.message);
        updatedOrders = data ?? [];
      } else if (existingRes.error) {
        throw new Error(existingRes.error.message);
      } else {
        const rows = (existingRes.data ?? []) as Array<{
          id: string;
          api_shipped_at?: string | null;
        }>;
        const results = await Promise.all(
          rows.map(async (row) => {
            const perRowFields: Record<string, unknown> = {
              ...updateFields,
              shipped_at: row.api_shipped_at ?? null,
              shipped_at_manual: false,
            };
            const { data, error } = await applyTenantFilter(
              admin.from("ml_sales_orders").update(perRowFields).eq("id", row.id).select("*"),
              ctx
            );
            if (error) throw new Error(error.message);
            return data?.[0];
          })
        );
        updatedOrders = results.filter(Boolean);
      }
    } else if (Object.keys(updateFields).length > 0) {
      const primaryRes = await applyTenantFilter(
        admin.from("ml_sales_orders").update(updateFields).in("id", orderIds).select("*"),
        ctx
      );

      if (primaryRes.error && isMissingColumnError(primaryRes.error, "shipped_at_manual")) {
        // Fallback gracioso caso shipped_at_manual ainda não exista no banco (atualiza shipped_at normalmente)
        const legacyFields = { ...updateFields };
        delete legacyFields.shipped_at_manual;
        const fallbackRes = await applyTenantFilter(
          admin.from("ml_sales_orders").update(legacyFields).in("id", orderIds).select("*"),
          ctx
        );
        if (fallbackRes.error) throw new Error(fallbackRes.error.message);
        updatedOrders = fallbackRes.data ?? [];
      } else if (primaryRes.error) {
        throw new Error(primaryRes.error.message);
      } else {
        updatedOrders = primaryRes.data ?? [];
      }
    }

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
      err instanceof Error ? err.message : "Erro ao atualizar pedidos.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
