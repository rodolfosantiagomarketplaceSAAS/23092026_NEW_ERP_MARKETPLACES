import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter } from "@/lib/mercadolivre/tenant-scope";
import { upsertPpfRollSchema } from "@/lib/validators/erp-products";
import { calculatePpfConsumption, round2 } from "@/lib/erp/ppf-calculator";
import type { ErpPpfRoll, ErpProduct } from "@/types/erp-products";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await applyTenantFilter(
    admin.from("erp_ppf_rolls").select("*").order("created_at", { ascending: false }),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, rolls: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = upsertPpfRollSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados da bobina inválidos." },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const admin = createSupabaseAdminClient();
  const normalizedCode = d.code.trim().toUpperCase();

  try {
    let savedRoll: ErpPpfRoll;

    if (d.id) {
      const updatePayload = {
        code: normalizedCode,
        name: d.name.trim(),
        brand: d.brand?.trim() || null,
        finish: d.finish.trim(),
        thickness_microns: d.thickness_microns ?? null,
        roll_width_cm: d.roll_width_cm,
        roll_length_m: d.roll_length_m,
        cost_per_linear_meter: d.cost_per_linear_meter,
        default_waste_margin_pct: d.default_waste_margin_pct,
        total_meters_purchased: d.total_meters_purchased ?? d.roll_length_m,
        remaining_meters: d.remaining_meters ?? d.roll_length_m,
        min_alert_meters: d.min_alert_meters,
        supplier: d.supplier?.trim() || null,
        lot_number: d.lot_number?.trim() || null,
        notes: d.notes?.trim() || null,
        active: d.active,
      };

      const { data, error } = await applyTenantFilter(
        admin.from("erp_ppf_rolls").update(updatePayload).eq("id", d.id).select("*"),
        ctx
      ).single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: error?.message || "Erro ao atualizar bobina PPF." },
          { status: 500 }
        );
      }
      savedRoll = data as ErpPpfRoll;

      // Recalcula custos persistidos nos produtos que usam esta bobina
      const { data: linkedProducts } = await applyTenantFilter(
        admin.from("erp_products").select("*").eq("ppf_roll_id", savedRoll.id).eq("uses_ppf_roll", true),
        ctx
      );

      for (const prod of (linkedProducts ?? []) as ErpProduct[]) {
        const calc = calculatePpfConsumption({
          width: Number(prod.width || 0),
          height: Number(prod.height || 0),
          dimensionUnit: prod.dimension_unit,
          pieceCount: prod.ppf_piece_count || 1,
          wasteMarginPct: Number(prod.ppf_waste_margin_pct ?? savedRoll.default_waste_margin_pct),
          calcMode: prod.ppf_calc_mode || "area",
          rollWidthCm: Number(savedRoll.roll_width_cm),
          rollLengthM: Number(savedRoll.roll_length_m),
          costPerLinearMeter: Number(savedRoll.cost_per_linear_meter),
        });
        await admin
          .from("erp_products")
          .update({
            ppf_area_m2: calc.grossAreaM2,
            ppf_linear_meters: calc.linearMeters,
            ppf_calculated_cost: calc.calculatedCost,
            total_cost: round2(calc.calculatedCost + Number(prod.extra_cost || 0)),
          })
          .eq("id", prod.id);
      }
    } else {
      const initialMeters = d.remaining_meters ?? d.total_meters_purchased ?? d.roll_length_m;
      const insertPayload = {
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        code: normalizedCode,
        name: d.name.trim(),
        brand: d.brand?.trim() || null,
        finish: d.finish.trim(),
        thickness_microns: d.thickness_microns ?? null,
        roll_width_cm: d.roll_width_cm,
        roll_length_m: d.roll_length_m,
        cost_per_linear_meter: d.cost_per_linear_meter,
        default_waste_margin_pct: d.default_waste_margin_pct,
        total_meters_purchased: d.total_meters_purchased ?? d.roll_length_m,
        remaining_meters: initialMeters,
        min_alert_meters: d.min_alert_meters,
        supplier: d.supplier?.trim() || null,
        lot_number: d.lot_number?.trim() || null,
        notes: d.notes?.trim() || null,
        active: d.active,
      };

      const { data, error } = await admin
        .from("erp_ppf_rolls")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: error?.message || "Erro ao cadastrar bobina PPF." },
          { status: 500 }
        );
      }
      savedRoll = data as ErpPpfRoll;

      // Registra entrada inicial no Kardex de movimentação
      if (initialMeters > 0) {
        await admin.from("erp_stock_movements").insert({
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          entity_type: "ppf_roll",
          ppf_roll_id: savedRoll.id,
          movement_type: "in",
          quantity_delta: initialMeters,
          balance_after: initialMeters,
          unit: "M",
          reason: "Cadastro inicial da bobina PPF",
        });
      }
    }

    return NextResponse.json({ success: true, roll: savedRoll });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar bobina PPF.";
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
    return NextResponse.json({ success: false, error: "Informe o ID da bobina." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await applyTenantFilter(
    admin.from("erp_ppf_rolls").delete().eq("id", id),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
