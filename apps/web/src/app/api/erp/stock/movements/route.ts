import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter } from "@/lib/mercadolivre/tenant-scope";
import { stockMovementSchema } from "@/lib/validators/erp-products";
import { round4 } from "@/lib/erp/ppf-calculator";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = stockMovementSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados de movimentação inválidos." },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const admin = createSupabaseAdminClient();

  try {
    if (d.entity_type === "ppf_roll") {
      if (!d.ppf_roll_id) {
        return NextResponse.json(
          { success: false, error: "Selecione a bobina PPF para movimentar." },
          { status: 400 }
        );
      }

      const { data: roll, error: rollErr } = await applyTenantFilter(
        admin.from("erp_ppf_rolls").select("*").eq("id", d.ppf_roll_id),
        ctx
      ).single();

      if (rollErr || !roll) {
        return NextResponse.json({ success: false, error: "Bobina PPF não encontrada." }, { status: 404 });
      }

      const currentBalance = Number(roll.remaining_meters || 0);
      let delta = 0;
      let nextBalance = currentBalance;

      if (d.movement_type === "in") {
        delta = round4(d.quantity);
        nextBalance = round4(currentBalance + delta);
      } else if (d.movement_type === "out") {
        delta = round4(-d.quantity);
        nextBalance = round4(currentBalance + delta);
      } else {
        // adjustment = define o saldo exato informado
        nextBalance = round4(d.quantity);
        delta = round4(nextBalance - currentBalance);
      }

      const updateFields: Record<string, unknown> = { remaining_meters: nextBalance };
      if (d.movement_type === "in") {
        updateFields.total_meters_purchased = round4(Number(roll.total_meters_purchased || 0) + d.quantity);
      }

      const { error: updErr } = await admin
        .from("erp_ppf_rolls")
        .update(updateFields)
        .eq("id", roll.id);

      if (updErr) {
        return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });
      }

      const { data: mov, error: movErr } = await admin
        .from("erp_stock_movements")
        .insert({
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          entity_type: "ppf_roll",
          ppf_roll_id: roll.id,
          movement_type: d.movement_type,
          quantity_delta: delta,
          balance_after: nextBalance,
          unit: "M",
          reason: d.reason?.trim() || (d.movement_type === "in" ? "Reposição de bobina PPF" : "Movimentação manual de bobina"),
        })
        .select("*")
        .single();

      if (movErr) {
        return NextResponse.json({ success: false, error: movErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, movement: mov, balance_after: nextBalance });
    }

    // Movimentação de Produto
    if (!d.product_id) {
      return NextResponse.json(
        { success: false, error: "Selecione o produto para movimentar." },
        { status: 400 }
      );
    }

    const { data: product, error: prodErr } = await applyTenantFilter(
      admin.from("erp_products").select("*").eq("id", d.product_id),
      ctx
    ).single();

    if (prodErr || !product) {
      return NextResponse.json({ success: false, error: "Produto não encontrado." }, { status: 404 });
    }

    const currentBalance = Number(product.stock_quantity || 0);
    let delta = 0;
    let nextBalance = currentBalance;

    if (d.movement_type === "in") {
      delta = round4(d.quantity);
      nextBalance = round4(currentBalance + delta);
    } else if (d.movement_type === "out") {
      delta = round4(-d.quantity);
      nextBalance = round4(currentBalance + delta);
    } else {
      nextBalance = round4(d.quantity);
      delta = round4(nextBalance - currentBalance);
    }

    const { error: updErr } = await admin
      .from("erp_products")
      .update({ stock_quantity: nextBalance })
      .eq("id", product.id);

    if (updErr) {
      return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });
    }

    const { data: mov, error: movErr } = await admin
      .from("erp_stock_movements")
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        entity_type: "product",
        product_id: product.id,
        movement_type: d.movement_type,
        quantity_delta: delta,
        balance_after: nextBalance,
        unit: product.unit || "UN",
        reason: d.reason?.trim() || "Movimentação manual de estoque",
      })
      .select("*")
      .single();

    if (movErr) {
      return NextResponse.json({ success: false, error: movErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, movement: mov, balance_after: nextBalance });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao registrar movimentação de estoque.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
