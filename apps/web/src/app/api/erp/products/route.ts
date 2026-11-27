import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter } from "@/lib/mercadolivre/tenant-scope";
import { upsertErpProductSchema } from "@/lib/validators/erp-products";
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
    admin.from("erp_products").select("*").order("updated_at", { ascending: false }),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, products: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = upsertErpProductSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados do produto inválidos." },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const admin = createSupabaseAdminClient();

  try {
    const isKit = d.product_type === "kit";
    const usesPpf = !isKit && (d.product_type === "ppf_piece" || d.uses_ppf_roll);

    let ppfAreaM2 = 0;
    let ppfLinearMeters = 0;
    let ppfCalculatedCost = 0;

    if (usesPpf && d.ppf_roll_id && Number(d.width || 0) > 0 && Number(d.height || 0) > 0) {
      const { data: rollData } = await applyTenantFilter(
        admin.from("erp_ppf_rolls").select("*").eq("id", d.ppf_roll_id),
        ctx
      ).maybeSingle();

      if (rollData) {
        const roll = rollData as ErpPpfRoll;
        const calc = calculatePpfConsumption({
          width: Number(d.width || 0),
          height: Number(d.height || 0),
          dimensionUnit: d.dimension_unit,
          pieceCount: d.ppf_piece_count || 1,
          wasteMarginPct: Number(d.ppf_waste_margin_pct ?? roll.default_waste_margin_pct ?? 15),
          calcMode: d.ppf_calc_mode || "area",
          rollWidthCm: Number(roll.roll_width_cm),
          rollLengthM: Number(roll.roll_length_m),
          costPerLinearMeter: Number(roll.cost_per_linear_meter),
        });
        ppfAreaM2 = calc.grossAreaM2;
        ppfLinearMeters = calc.linearMeters;
        ppfCalculatedCost = calc.calculatedCost;
      }
    }

    // Se for kit, calcula custo preliminar a partir dos componentes enviados
    let kitComponentsCost = 0;
    if (isKit && d.kit_items && d.kit_items.length > 0) {
      const compIds = d.kit_items.map((item) => item.component_product_id);
      const { data: comps } = await applyTenantFilter(
        admin.from("erp_products").select("id, total_cost").in("id", compIds),
        ctx
      );
      const costById = new Map(
        ((comps ?? []) as Array<{ id: string; total_cost: number }>).map((c) => [
          c.id,
          Number(c.total_cost || 0),
        ])
      );
      kitComponentsCost = round2(
        d.kit_items.reduce(
          (acc, item) => acc + (costById.get(item.component_product_id) ?? 0) * item.quantity,
          0
        )
      );
    }

    const totalCost = isKit
      ? round2(kitComponentsCost + Number(d.extra_cost || 0))
      : usesPpf
      ? round2(ppfCalculatedCost + Number(d.extra_cost || 0))
      : round2(Number(d.manual_cost || 0) + Number(d.extra_cost || 0));

    const primaryPhoto =
      d.photos.find((p) => p.is_primary)?.url || d.photos[0]?.url || d.thumbnail_url || null;

    const basePayload = {
      product_type: d.product_type,
      code: d.code.trim().toUpperCase(),
      sku: d.sku.trim().toUpperCase(),
      ean: d.ean?.trim() || null,
      name: d.name.trim(),
      description: d.description?.trim() || null,
      category: d.category?.trim() || null,
      brand: d.brand?.trim() || null,
      supplier: d.supplier?.trim() || null,
      ...(d.supplier_id !== undefined ? { supplier_id: d.supplier_id || null } : {}),
      ncm: d.ncm?.trim() || null,
      unit: d.unit.trim().toUpperCase(),
      status: d.status,
      cost_category: d.cost_category,
      thumbnail_url: primaryPhoto,
      photos: d.photos,
      dimension_unit: d.dimension_unit,
      width: d.width ?? null,
      height: d.height ?? null,
      depth: d.depth ?? null,
      weight_grams: d.weight_grams,
      uses_ppf_roll: usesPpf,
      ppf_roll_id: usesPpf ? d.ppf_roll_id ?? null : null,
      ppf_calc_mode: d.ppf_calc_mode,
      ppf_waste_margin_pct: d.ppf_waste_margin_pct,
      ppf_piece_count: d.ppf_piece_count,
      ppf_area_m2: ppfAreaM2,
      ppf_linear_meters: ppfLinearMeters,
      ppf_calculated_cost: ppfCalculatedCost,
      manual_cost: d.manual_cost,
      extra_cost: d.extra_cost,
      total_cost: totalCost,
      suggested_price: d.suggested_price,
      min_price: d.min_price,
      stock_quantity: d.stock_quantity,
      min_stock_quantity: d.min_stock_quantity,
      storage_location: d.storage_location?.trim() || null,
      notes: d.notes?.trim() || null,
    };

    let savedProduct: ErpProduct;

    if (d.id) {
      const { data, error } = await applyTenantFilter(
        admin.from("erp_products").update(basePayload).eq("id", d.id).select("*"),
        ctx
      ).single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: error?.message || "Erro ao atualizar produto." },
          { status: 500 }
        );
      }
      savedProduct = data as ErpProduct;
    } else {
      const { data, error } = await admin
        .from("erp_products")
        .insert({
          ...basePayload,
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
        })
        .select("*")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: error?.message || "Erro ao cadastrar produto." },
          { status: 500 }
        );
      }
      savedProduct = data as ErpProduct;

      if (!isKit && Number(d.stock_quantity || 0) > 0) {
        await admin.from("erp_stock_movements").insert({
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          entity_type: "product",
          product_id: savedProduct.id,
          movement_type: "in",
          quantity_delta: Number(d.stock_quantity),
          balance_after: Number(d.stock_quantity),
          unit: savedProduct.unit,
          reason: "Saldo inicial no cadastro do produto",
        });
      }
    }

    // Atualiza composição do Kit (BOM) quando for produto tipo kit
    if (isKit && d.kit_items !== undefined) {
      await applyTenantFilter(
        admin.from("erp_kit_items").delete().eq("kit_product_id", savedProduct.id),
        ctx
      );

      const validItems = d.kit_items.filter(
        (item) => item.component_product_id !== savedProduct.id && item.quantity > 0
      );

      if (validItems.length > 0) {
        const rows = validItems.map((item, idx) => ({
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          kit_product_id: savedProduct.id,
          component_product_id: item.component_product_id,
          quantity: item.quantity,
          sort_order: idx,
          notes: item.notes?.trim() || null,
        }));

        const { error: kitErr } = await admin.from("erp_kit_items").insert(rows);
        if (kitErr) {
          return NextResponse.json(
            { success: false, error: `Produto salvo, mas erro na composição do kit: ${kitErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ success: true, product: savedProduct });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar produto.";
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
    return NextResponse.json({ success: false, error: "Informe o ID do produto." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await applyTenantFilter(
    admin.from("erp_products").delete().eq("id", id),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
