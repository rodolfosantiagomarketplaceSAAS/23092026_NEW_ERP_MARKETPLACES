import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter, isMissingTableError } from "@/lib/mercadolivre/tenant-scope";
import { upsertPpfRollSchema } from "@/lib/validators/erp-products";
import { calculatePpfConsumption, round2, round4 } from "@/lib/erp/ppf-calculator";
import { syncRollSummaryAndCurrentProductCosts } from "@/lib/erp/ppf-fifo-engine";
import type { ErpPpfRoll, ErpPpfRollLot, ErpProduct } from "@/types/erp-products";

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
        ...(d.supplier_id !== undefined ? { supplier_id: d.supplier_id || null } : {}),
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

      // Sincroniza com `erp_ppf_roll_lots` se a tabela existir:
      // - Se houver apenas 1 lote sem consumos históricos em vendas, permite correção de cadastro (preço/saldo/fornecedor);
      // - Caso já existam múltiplos lotes ou vendas vinculadas, preserva os custos históricos dos lotes e sincroniza!
      const lotsRes = await applyTenantFilter(
        admin.from("erp_ppf_roll_lots").select("*").eq("ppf_roll_id", savedRoll.id),
        ctx
      );

      if (!isMissingTableError(lotsRes.error) && (lotsRes.data?.length ?? 0) > 0) {
        const lots = (lotsRes.data ?? []) as ErpPpfRollLot[];
        if (lots.length === 1) {
          const singleLot = lots[0];
          const { count: usedCount } = await applyTenantFilter(
            admin
              .from("erp_order_roll_consumptions")
              .select("id", { count: "exact", head: true })
              .eq("ppf_roll_lot_id", singleLot.id),
            ctx
          );

          if ((usedCount ?? 0) === 0) {
            const widthM = Math.max(0.01, Number(d.roll_width_cm || 152) / 100);
            const nextRem = d.remaining_meters ?? Number(singleLot.remaining_meters);
            const nextInit = Math.max(
              Number(d.total_meters_purchased ?? d.roll_length_m),
              nextRem,
              0.001
            );
            await applyTenantFilter(
              admin
                .from("erp_ppf_roll_lots")
                .update({
                  roll_width_cm: d.roll_width_cm,
                  initial_meters: nextInit,
                  remaining_meters: Math.max(0, nextRem),
                  cost_per_linear_meter: round4(d.cost_per_linear_meter),
                  cost_per_m2: round4(d.cost_per_linear_meter / widthM),
                  total_purchase_cost: round2(d.cost_per_linear_meter * nextInit),
                  supplier_id: d.supplier_id || null,
                  supplier_name: d.supplier?.trim() || null,
                  lot_code: (d.lot_number?.trim() || singleLot.lot_code).toUpperCase(),
                  status: nextRem > 0 ? "in_use" : "exhausted",
                })
                .eq("id", singleLot.id),
              ctx
            );
          }
        }

        await syncRollSummaryAndCurrentProductCosts(ctx, savedRoll.id);
      } else {
        // Fallback legado sem tabela de lotes
        const { data: linkedProducts } = await applyTenantFilter(
          admin
            .from("erp_products")
            .select("*")
            .eq("ppf_roll_id", savedRoll.id)
            .eq("uses_ppf_roll", true),
          ctx
        );

        await Promise.all(
          ((linkedProducts ?? []) as ErpProduct[]).map((prod) => {
            const calc = calculatePpfConsumption({
              width: Number(prod.width || 0),
              height: Number(prod.height || 0),
              dimensionUnit: prod.dimension_unit,
              pieceCount: prod.ppf_piece_count || 1,
              wasteMarginPct: Number(
                prod.ppf_waste_margin_pct ?? savedRoll.default_waste_margin_pct
              ),
              calcMode: prod.ppf_calc_mode || "area",
              rollWidthCm: Number(savedRoll.roll_width_cm),
              rollLengthM: Number(savedRoll.roll_length_m),
              costPerLinearMeter: Number(savedRoll.cost_per_linear_meter),
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
        ...(d.supplier_id !== undefined ? { supplier_id: d.supplier_id || null } : {}),
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

      // Cria o Lote Inicial PEPS (se tabela de lotes já existir no Supabase)
      let createdLotId: string | null = null;
      if (initialMeters > 0) {
        const widthM = Math.max(0.01, Number(savedRoll.roll_width_cm || 152) / 100);
        const totalPurchaseCost = round2(Number(savedRoll.cost_per_linear_meter) * initialMeters);
        const { data: lotData } = await admin
          .from("erp_ppf_roll_lots")
          .insert({
            organization_id: ctx.organizationId,
            user_id: ctx.userId,
            ppf_roll_id: savedRoll.id,
            supplier_id: savedRoll.supplier_id ?? null,
            supplier_name: savedRoll.supplier ?? null,
            lot_code: (savedRoll.lot_number || `LOTE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-01`).toUpperCase(),
            purchase_date: new Date().toISOString().slice(0, 10),
            roll_width_cm: Number(savedRoll.roll_width_cm),
            initial_meters: initialMeters,
            remaining_meters: initialMeters,
            total_purchase_cost: totalPurchaseCost,
            cost_per_linear_meter: round4(Number(savedRoll.cost_per_linear_meter)),
            cost_per_m2: round4(Number(savedRoll.cost_per_linear_meter) / widthM),
            status: "in_use",
            queue_order: 1,
            started_using_at: new Date().toISOString(),
            notes: "Lote inicial criado no cadastro da bobina PPF",
          })
          .select("id")
          .maybeSingle();

        if (lotData?.id) {
          createdLotId = String(lotData.id);
        }

        // Registra entrada inicial no Kardex de movimentação
        const movPayload: Record<string, unknown> = {
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          entity_type: "ppf_roll",
          ppf_roll_id: savedRoll.id,
          movement_type: "in",
          quantity_delta: initialMeters,
          balance_after: initialMeters,
          unit: "M",
          reason: "Cadastro inicial da bobina PPF",
        };
        if (createdLotId) {
          movPayload.ppf_roll_lot_id = createdLotId;
          movPayload.supplier_id = savedRoll.supplier_id ?? null;
          movPayload.unit_cost = Number(savedRoll.cost_per_linear_meter);
          movPayload.total_cost = totalPurchaseCost;
        }
        await admin.from("erp_stock_movements").insert(movPayload);
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
