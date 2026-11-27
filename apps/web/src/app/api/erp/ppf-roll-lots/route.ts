import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter, isMissingTableError } from "@/lib/mercadolivre/tenant-scope";
import { createPpfRollLotSchema, ppfRollLotActionSchema } from "@/lib/validators/erp-products";
import { round2, round4 } from "@/lib/erp/ppf-calculator";
import {
  sortRollLotsFifo,
  syncRollSummaryAndCurrentProductCosts,
} from "@/lib/erp/ppf-fifo-engine";
import type { ErpPpfRoll, ErpPpfRollLot, ErpSupplier } from "@/types/erp-products";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rollId = request.nextUrl.searchParams.get("rollId");
  const admin = createSupabaseAdminClient();

  let query = admin.from("erp_ppf_roll_lots").select("*");
  if (rollId) {
    query = query.eq("ppf_roll_id", rollId);
  }

  const [lotsRes, suppliersRes] = await Promise.all([
    applyTenantFilter(query, ctx),
    applyTenantFilter(admin.from("erp_suppliers").select("*"), ctx),
  ]);

  if (isMissingTableError(lotsRes.error)) {
    return NextResponse.json({
      success: true,
      schemaReady: false,
      lots: [],
    });
  }

  if (lotsRes.error) {
    return NextResponse.json({ success: false, error: lotsRes.error.message }, { status: 500 });
  }

  const supplierMap = new Map(
    (!isMissingTableError(suppliersRes.error) ? (suppliersRes.data ?? []) : []).map((s) => [
      (s as ErpSupplier).id,
      s as ErpSupplier,
    ])
  );

  const lots = sortRollLotsFifo(
    ((lotsRes.data ?? []) as ErpPpfRollLot[]).map((l) => ({
      ...l,
      supplier_ref: l.supplier_id ? supplierMap.get(l.supplier_id) ?? null : null,
    }))
  );

  return NextResponse.json({
    success: true,
    schemaReady: true,
    lots,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = createPpfRollLotSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados da compra de bobina inválidos." },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const admin = createSupabaseAdminClient();

  try {
    const [rollRes, existingLotsRes, supplierRes] = await Promise.all([
      applyTenantFilter(
        admin.from("erp_ppf_rolls").select("*").eq("id", d.ppf_roll_id),
        ctx
      ).single(),
      applyTenantFilter(
        admin.from("erp_ppf_roll_lots").select("*").eq("ppf_roll_id", d.ppf_roll_id),
        ctx
      ),
      d.supplier_id
        ? applyTenantFilter(
            admin.from("erp_suppliers").select("id, trade_name").eq("id", d.supplier_id),
            ctx
          ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (rollRes.error || !rollRes.data) {
      return NextResponse.json(
        { success: false, error: "Bobina PPF não encontrada." },
        { status: 404 }
      );
    }

    if (isMissingTableError(existingLotsRes.error)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Execute a migration SQL 20261127180000_create_erp_ppf_roll_lots_and_cost_snapshots.sql no Supabase antes de cadastrar lotes de compra.",
        },
        { status: 400 }
      );
    }

    const roll = rollRes.data as ErpPpfRoll;
    const existingLots = (existingLotsRes.data ?? []) as ErpPpfRollLot[];
    const currentInUse = existingLots.find((l) => l.status === "in_use");

    const rollWidthCm = d.roll_width_cm ?? Number(roll.roll_width_cm || 152);
    const widthM = Math.max(0.01, rollWidthCm / 100);
    const costPerLinearMeter = round4(d.total_purchase_cost / d.initial_meters);
    const costPerM2 = round4(costPerLinearMeter / widthM);

    const maxQueueOrder = existingLots.reduce(
      (max, l) => Math.max(max, Number(l.queue_order || 0)),
      0
    );

    const shouldStartInUse = !currentInUse || d.activate_immediately;
    const nowIso = new Date().toISOString();

    // Se o usuário pediu para ativar imediatamente e já havia um lote em uso, move o anterior para o topo da fila
    if (d.activate_immediately && currentInUse) {
      await applyTenantFilter(
        admin
          .from("erp_ppf_roll_lots")
          .update({ status: "queued" })
          .eq("id", currentInUse.id),
        ctx
      );
    }

    const resolvedSupplierName =
      (supplierRes.data as { trade_name?: string } | null)?.trade_name ||
      d.supplier_name?.trim() ||
      roll.supplier ||
      null;

    const { data: insertedLot, error: insertErr } = await admin
      .from("erp_ppf_roll_lots")
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        ppf_roll_id: d.ppf_roll_id,
        supplier_id: d.supplier_id || null,
        supplier_name: resolvedSupplierName,
        lot_code: d.lot_code.trim().toUpperCase(),
        invoice_number: d.invoice_number?.trim() || null,
        purchase_date: d.purchase_date.slice(0, 10),
        roll_width_cm: rollWidthCm,
        initial_meters: d.initial_meters,
        remaining_meters: d.initial_meters,
        total_purchase_cost: round2(d.total_purchase_cost),
        cost_per_linear_meter: costPerLinearMeter,
        cost_per_m2: costPerM2,
        status: shouldStartInUse ? "in_use" : "queued",
        queue_order: maxQueueOrder + 1,
        started_using_at: shouldStartInUse ? nowIso : null,
        notes: d.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (insertErr || !insertedLot) {
      return NextResponse.json(
        { success: false, error: insertErr?.message || "Erro ao registrar compra da bobina." },
        { status: 500 }
      );
    }

    const lot = insertedLot as ErpPpfRollLot;
    const syncRes = await syncRollSummaryAndCurrentProductCosts(ctx, d.ppf_roll_id);

    // Registra entrada valorizada no Kardex
    await admin.from("erp_stock_movements").insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      entity_type: "ppf_roll",
      ppf_roll_id: d.ppf_roll_id,
      ppf_roll_lot_id: lot.id,
      supplier_id: lot.supplier_id,
      movement_type: "in",
      quantity_delta: d.initial_meters,
      balance_after: syncRes.totalRemainingMeters,
      unit: "M",
      unit_cost: costPerLinearMeter,
      total_cost: round2(d.total_purchase_cost),
      reason: `Compra de Bobina • Lote ${lot.lot_code}${resolvedSupplierName ? ` (${resolvedSupplierName})` : ""} • R$ ${round2(d.total_purchase_cost).toFixed(2)}`,
    });

    return NextResponse.json({
      success: true,
      lot,
      activeLot: syncRes.activeLot,
      totalRemainingMeters: syncRes.totalRemainingMeters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao registrar lote de bobina.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = ppfRollLotActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Ação inválida no lote." },
      { status: 400 }
    );
  }

  const { lot_id, action, remaining_meters, reason } = parsed.data;
  const admin = createSupabaseAdminClient();

  try {
    const { data: lotData, error: lotErr } = await applyTenantFilter(
      admin.from("erp_ppf_roll_lots").select("*").eq("id", lot_id),
      ctx
    ).single();

    if (lotErr || !lotData) {
      return NextResponse.json({ success: false, error: "Lote não encontrado." }, { status: 404 });
    }

    const lot = lotData as ErpPpfRollLot;
    const nowIso = new Date().toISOString();

    if (action === "exhaust") {
      const previousRemaining = Number(lot.remaining_meters || 0);

      await applyTenantFilter(
        admin
          .from("erp_ppf_roll_lots")
          .update({
            status: "exhausted",
            remaining_meters: 0,
            exhausted_at: nowIso,
          })
          .eq("id", lot.id),
        ctx
      );

      // Promove automaticamente o próximo lote na fila PEPS para `in_use`
      const { data: siblingLots } = await applyTenantFilter(
        admin
          .from("erp_ppf_roll_lots")
          .select("*")
          .eq("ppf_roll_id", lot.ppf_roll_id)
          .eq("status", "queued"),
        ctx
      );

      const nextQueued = sortRollLotsFifo((siblingLots ?? []) as ErpPpfRollLot[]).find(
        (l) => Number(l.remaining_meters) > 0
      );

      if (nextQueued) {
        await applyTenantFilter(
          admin
            .from("erp_ppf_roll_lots")
            .update({
              status: "in_use",
              started_using_at: nextQueued.started_using_at || nowIso,
            })
            .eq("id", nextQueued.id),
          ctx
        );
      }

      const syncRes = await syncRollSummaryAndCurrentProductCosts(ctx, lot.ppf_roll_id);

      if (previousRemaining > 0) {
        await admin.from("erp_stock_movements").insert({
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          entity_type: "ppf_roll",
          ppf_roll_id: lot.ppf_roll_id,
          ppf_roll_lot_id: lot.id,
          supplier_id: lot.supplier_id,
          movement_type: "adjustment",
          quantity_delta: round4(-previousRemaining),
          balance_after: syncRes.totalRemainingMeters,
          unit: "M",
          unit_cost: Number(lot.cost_per_linear_meter),
          total_cost: round2(previousRemaining * Number(lot.cost_per_linear_meter)),
          reason:
            reason?.trim() ||
            `Bobina encerrada manualmente (Lote ${lot.lot_code}) — próximo lote assumiu custo vigente`,
        });
      }

      return NextResponse.json({
        success: true,
        promotedLot: nextQueued ?? null,
        activeLot: syncRes.activeLot,
        totalRemainingMeters: syncRes.totalRemainingMeters,
      });
    }

    if (action === "activate") {
      // Rebaixa eventual lote atualmente em uso para a fila
      await applyTenantFilter(
        admin
          .from("erp_ppf_roll_lots")
          .update({ status: "queued" })
          .eq("ppf_roll_id", lot.ppf_roll_id)
          .eq("status", "in_use"),
        ctx
      );

      await applyTenantFilter(
        admin
          .from("erp_ppf_roll_lots")
          .update({
            status: "in_use",
            started_using_at: lot.started_using_at || nowIso,
            exhausted_at: null,
          })
          .eq("id", lot.id),
        ctx
      );

      const syncRes = await syncRollSummaryAndCurrentProductCosts(ctx, lot.ppf_roll_id);
      return NextResponse.json({
        success: true,
        activeLot: syncRes.activeLot,
        totalRemainingMeters: syncRes.totalRemainingMeters,
      });
    }

    // adjust_meters
    if (remaining_meters === undefined) {
      return NextResponse.json(
        { success: false, error: "Informe o novo saldo em metros do lote." },
        { status: 400 }
      );
    }

    const nextRem = round4(Math.max(0, remaining_meters));
    const delta = round4(nextRem - Number(lot.remaining_meters || 0));
    const nextStatus =
      nextRem <= 0
        ? "exhausted"
        : lot.status === "exhausted"
        ? "queued"
        : lot.status;

    await applyTenantFilter(
      admin
        .from("erp_ppf_roll_lots")
        .update({
          remaining_meters: nextRem,
          status: nextStatus,
          exhausted_at: nextRem <= 0 ? nowIso : null,
        })
        .eq("id", lot.id),
      ctx
    );

    const syncRes = await syncRollSummaryAndCurrentProductCosts(ctx, lot.ppf_roll_id);

    if (delta !== 0) {
      await admin.from("erp_stock_movements").insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        entity_type: "ppf_roll",
        ppf_roll_id: lot.ppf_roll_id,
        ppf_roll_lot_id: lot.id,
        supplier_id: lot.supplier_id,
        movement_type: "adjustment",
        quantity_delta: delta,
        balance_after: syncRes.totalRemainingMeters,
        unit: "M",
        unit_cost: Number(lot.cost_per_linear_meter),
        total_cost: round2(Math.abs(delta) * Number(lot.cost_per_linear_meter)),
        reason: reason?.trim() || `Ajuste manual de saldo no Lote ${lot.lot_code}`,
      });
    }

    return NextResponse.json({
      success: true,
      activeLot: syncRes.activeLot,
      totalRemainingMeters: syncRes.totalRemainingMeters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar lote.";
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
    return NextResponse.json({ success: false, error: "Informe o ID do lote." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: lotData } = await applyTenantFilter(
    admin.from("erp_ppf_roll_lots").select("id, ppf_roll_id").eq("id", id),
    ctx
  ).maybeSingle();

  if (!lotData) {
    return NextResponse.json({ success: false, error: "Lote não encontrado." }, { status: 404 });
  }

  // Proteção contábil: impede exclusão de lote já consumido em histórico de vendas
  const { count } = await applyTenantFilter(
    admin
      .from("erp_order_roll_consumptions")
      .select("id", { count: "exact", head: true })
      .eq("ppf_roll_lot_id", id),
    ctx
  );

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Este lote já está vinculado ao histórico de custos de vendas. Use 'Encerrar Bobina' em vez de excluir para preservar a auditoria financeira.",
      },
      { status: 409 }
    );
  }

  const { error } = await applyTenantFilter(
    admin.from("erp_ppf_roll_lots").delete().eq("id", id),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  await syncRollSummaryAndCurrentProductCosts(
    ctx,
    String((lotData as { ppf_roll_id: string }).ppf_roll_id)
  );

  return NextResponse.json({ success: true });
}
