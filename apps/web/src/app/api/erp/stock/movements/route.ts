import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter, isMissingTableError } from "@/lib/mercadolivre/tenant-scope";
import { stockMovementSchema } from "@/lib/validators/erp-products";
import { round2, round4 } from "@/lib/erp/ppf-calculator";
import {
  allocateFifoMetersFromLots,
  getCurrentActiveLot,
  syncRollSummaryAndCurrentProductCosts,
} from "@/lib/erp/ppf-fifo-engine";
import type { ErpPpfRoll, ErpPpfRollLot } from "@/types/erp-products";

export const dynamic = "force-dynamic";

/**
 * Persiste lotes tocados respeitando o índice único parcial `status = 'in_use'`:
 * atualiza primeiro lotes que SAÍRAM de `in_use` (`exhausted`/`queued`) e por último o lote promovido para `in_use`.
 */
async function persistTouchedLotsSafely(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>,
  lots: ErpPpfRollLot[],
  touchedIds: Set<string>
) {
  const touched = lots
    .filter((l) => touchedIds.has(l.id))
    .sort((a, b) => (a.status === "in_use" ? 1 : 0) - (b.status === "in_use" ? 1 : 0));

  for (const lot of touched) {
    await applyTenantFilter(
      admin
        .from("erp_ppf_roll_lots")
        .update({
          remaining_meters: lot.remaining_meters,
          status: lot.status,
          started_using_at: lot.started_using_at,
          exhausted_at: lot.exhausted_at,
        })
        .eq("id", lot.id),
      ctx
    );
  }
}

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

      const [rollRes, lotsRes] = await Promise.all([
        applyTenantFilter(
          admin.from("erp_ppf_rolls").select("*").eq("id", d.ppf_roll_id),
          ctx
        ).single(),
        applyTenantFilter(
          admin.from("erp_ppf_roll_lots").select("*").eq("ppf_roll_id", d.ppf_roll_id),
          ctx
        ),
      ]);

      if (rollRes.error || !rollRes.data) {
        return NextResponse.json({ success: false, error: "Bobina PPF não encontrada." }, { status: 404 });
      }

      const roll = rollRes.data as ErpPpfRoll;
      const lotsSchemaReady = !isMissingTableError(lotsRes.error);
      const lots = lotsSchemaReady ? ((lotsRes.data ?? []) as ErpPpfRollLot[]) : [];

      // Caminho PEPS Integrado: mantém `erp_ppf_roll_lots` e `erp_ppf_rolls` 100% sincronizados!
      if (lotsSchemaReady && lots.length > 0) {
        const nowIso = new Date().toISOString();
        const currentTotal = round4(
          lots
            .filter((l) => l.status === "in_use" || l.status === "queued")
            .reduce((acc, l) => acc + Math.max(0, Number(l.remaining_meters || 0)), 0)
        );

        let delta = 0;
        if (d.movement_type === "in") {
          delta = round4(d.quantity);
        } else if (d.movement_type === "out") {
          delta = round4(-d.quantity);
        } else {
          delta = round4(d.quantity - currentTotal);
        }

        if (delta < 0) {
          // Saída / perda de corte / ajuste para baixo: consome na ordem PEPS
          const mutableLots = lots.map((l) => ({ ...l }));
          const fifo = allocateFifoMetersFromLots({
            mutableLots,
            roll,
            metersNeeded: Math.abs(delta),
            nowIso,
          });

          await persistTouchedLotsSafely(
            admin,
            ctx,
            mutableLots,
            new Set(fifo.touchedLotIds)
          );

          const syncRes = await syncRollSummaryAndCurrentProductCosts(ctx, roll.id);

          const movRows = fifo.allocations.map((alloc) => ({
            organization_id: ctx.organizationId,
            user_id: ctx.userId,
            entity_type: "ppf_roll",
            ppf_roll_id: roll.id,
            ppf_roll_lot_id: alloc.lot_id,
            supplier_id: alloc.supplier_id,
            movement_type: d.movement_type,
            quantity_delta: round4(-alloc.meters),
            balance_after: syncRes.totalRemainingMeters,
            unit: "M",
            unit_cost: alloc.unit_cost_per_meter,
            total_cost: alloc.total_cost,
            reason:
              d.reason?.trim() ||
              `Ajuste/Saída PEPS (${alloc.lot_code}) @ R$ ${alloc.unit_cost_per_meter.toFixed(2)}/m`,
          }));

          const { data: insertedMovs, error: movErr } = await admin
            .from("erp_stock_movements")
            .insert(movRows)
            .select("*");

          if (movErr) {
            return NextResponse.json({ success: false, error: movErr.message }, { status: 500 });
          }

          return NextResponse.json({
            success: true,
            movement: insertedMovs?.[0] ?? null,
            balance_after: syncRes.totalRemainingMeters,
          });
        }

        if (delta > 0) {
          // Entrada / ajuste positivo: adiciona ao lote ativo atual (ou reativa o mais recente)
          const targetLot = getCurrentActiveLot(lots);
          let targetLotId: string | null = null;
          let unitCost = Number(roll.cost_per_linear_meter || 0);

          if (targetLot) {
            targetLotId = targetLot.id;
            unitCost = Number(targetLot.cost_per_linear_meter || unitCost);
            const hasAnotherInUse = lots.some(
              (l) => l.status === "in_use" && l.id !== targetLot.id
            );
            const nextLotRem = round4(Number(targetLot.remaining_meters || 0) + delta);
            const nextInitial = Math.max(Number(targetLot.initial_meters || 0), nextLotRem);

            await applyTenantFilter(
              admin
                .from("erp_ppf_roll_lots")
                .update({
                  remaining_meters: nextLotRem,
                  initial_meters:
                    d.movement_type === "in"
                      ? round4(Number(targetLot.initial_meters || 0) + delta)
                      : nextInitial,
                  status:
                    targetLot.status === "exhausted"
                      ? hasAnotherInUse
                        ? "queued"
                        : "in_use"
                      : targetLot.status,
                  exhausted_at: null,
                })
                .eq("id", targetLot.id),
              ctx
            );
          }

          const syncRes = await syncRollSummaryAndCurrentProductCosts(ctx, roll.id);

          const { data: mov, error: movErr } = await admin
            .from("erp_stock_movements")
            .insert({
              organization_id: ctx.organizationId,
              user_id: ctx.userId,
              entity_type: "ppf_roll",
              ppf_roll_id: roll.id,
              ppf_roll_lot_id: targetLotId,
              supplier_id: targetLot?.supplier_id ?? roll.supplier_id ?? null,
              movement_type: d.movement_type,
              quantity_delta: delta,
              balance_after: syncRes.totalRemainingMeters,
              unit: "M",
              unit_cost: unitCost,
              total_cost: round2(delta * unitCost),
              reason:
                d.reason?.trim() ||
                (d.movement_type === "in"
                  ? `Entrada/Reposição no lote ${targetLot?.lot_code || ""}`
                  : `Ajuste positivo de saldo (${targetLot?.lot_code || ""})`),
            })
            .select("*")
            .single();

          if (movErr) {
            return NextResponse.json({ success: false, error: movErr.message }, { status: 500 });
          }

          return NextResponse.json({
            success: true,
            movement: mov,
            balance_after: syncRes.totalRemainingMeters,
          });
        }

        return NextResponse.json({
          success: true,
          movement: null,
          balance_after: currentTotal,
        });
      }

      // Fallback pré-migração de lotes
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
        nextBalance = round4(d.quantity);
        delta = round4(nextBalance - currentBalance);
      }

      const updateFields: Record<string, unknown> = { remaining_meters: nextBalance };
      if (d.movement_type === "in") {
        updateFields.total_meters_purchased = round4(
          Number(roll.total_meters_purchased || 0) + d.quantity
        );
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
          reason:
            d.reason?.trim() ||
            (d.movement_type === "in" ? "Reposição de bobina PPF" : "Movimentação manual de bobina"),
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
