import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { upsertCostTemplateSchema } from "@/lib/validators/ml-sales";
import {
  applyTenantFilter,
  isMissingColumnError,
  upsertTenantCostTemplate,
} from "@/lib/mercadolivre/tenant-scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await applyTenantFilter(
    admin
      .from("product_cost_templates")
      .select("*")
      .order("updated_at", { ascending: false }),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = upsertCostTemplateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." },
      { status: 400 }
    );
  }

  try {
    const template = await upsertTenantCostTemplate(ctx, {
      mlb_id: parsed.data.mlb_id,
      sku: parsed.data.sku ?? null,
      material_cost: parsed.data.material_cost,
      packaging_cost: parsed.data.packaging_cost,
      logistics_cost: parsed.data.logistics_cost,
      printing_cost: parsed.data.printing_cost,
      accessories_kit_cost: parsed.data.accessories_kit_cost,
      default_tax_pct: parsed.data.default_tax_pct,
      default_seller_id: parsed.data.default_seller_id ?? null,
    });

    // Opcionalmente aplica custos/vendedor padrão nos pedidos existentes desse MLB ainda não editados manualmente
    if (parsed.data.applyToExistingUnassigned) {
      const admin = createSupabaseAdminClient();

      if (template.default_seller_id) {
        await applyTenantFilter(
          admin
            .from("ml_sales_orders")
            .update({ assigned_seller_id: template.default_seller_id })
            .eq("mlb_id", template.mlb_id)
            .is("assigned_seller_id", null),
          ctx
        );
      }

      // Proteção Histórica ERP: atualiza SOMENTE pedidos que não foram editados manualmente
      // E que NÃO possuem snapshot histórico congelado (`cost_snapshot_locked = false`)!
      let ordersRes = await applyTenantFilter(
        admin
          .from("ml_sales_orders")
          .select("id, quantity")
          .eq("mlb_id", template.mlb_id)
          .eq("costs_manually_edited", false)
          .eq("cost_snapshot_locked", false),
        ctx
      );

      let snapshotColsReady = true;
      if (ordersRes.error && isMissingColumnError(ordersRes.error, "cost_snapshot_locked")) {
        snapshotColsReady = false;
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

      const targetOrders = (ordersRes.data ?? []) as Array<{ id: string; quantity: number }>;
      const nowIso = new Date().toISOString();
      const BATCH_SIZE = 20;

      for (let i = 0; i < targetOrders.length; i += BATCH_SIZE) {
        const batch = targetOrders.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((ord) => {
            const qty = Math.max(1, Number(ord.quantity || 1));
            const payload: Record<string, unknown> = {
              tax_pct: template.default_tax_pct,
              cost_material: Number((template.material_cost * qty).toFixed(2)),
              cost_packaging: template.packaging_cost,
              cost_logistics: template.logistics_cost,
              cost_printing: template.printing_cost,
              cost_accessories_kit: Number((template.accessories_kit_cost * qty).toFixed(2)),
            };
            if (snapshotColsReady) {
              payload.cost_snapshot_locked = true;
              payload.cost_snapshot_locked_at = nowIso;
              payload.cost_snapshot_source = "template_snapshot";
            }
            return admin.from("ml_sales_orders").update(payload).eq("id", ord.id);
          })
        );
      }
    }

    return NextResponse.json({ success: true, template });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao salvar regra padrão de anúncio MLB.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Informe o ID do template." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await applyTenantFilter(
    admin.from("product_cost_templates").delete().eq("id", id),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

