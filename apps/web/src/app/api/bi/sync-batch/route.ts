import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { resolveRequestUser } from "@/lib/extension/auth";
import { runSmartRadarSync } from "@/lib/mercadolivre/radar-sync-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SyncBatchSchema = z.object({
  anuncioProprioIds: z.array(z.string().uuid()).optional(),
  platform: z.enum(["mercadolivre", "shopee"]).default("mercadolivre"),
  scope: z.enum(["monitored", "all"]).default("monitored"),
  forceAll: z.boolean().optional(),
  verifiedCompetitors: z.record(z.string(), z.record(z.string(), z.any())).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveRequestUser(req);
    const webCtx = !authUser ? await getAuthContext().catch(() => null) : null;
    const userId = authUser?.id ?? webCtx?.userId ?? null;
    const organizationId = webCtx?.organizationId ?? null;

    let payload: unknown = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const parsed = SyncBatchSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { anuncioProprioIds, platform, scope, verifiedCompetitors } = parsed.data;
    const supabase = createSupabaseAdminClient();

    const { stats, comparative } = await runSmartRadarSync({
      supabase,
      userId,
      organizationId,
      platform,
      scope,
      myListingIds: anuncioProprioIds,
      verifiedCompetitors,
    });

    const priceDeltaTotal = stats.priceDropsDetected + stats.priceIncreasesDetected;
    const deltaText =
      priceDeltaTotal > 0
        ? ` (${priceDeltaTotal} alteração${priceDeltaTotal === 1 ? "" : "ões"} de preço detectada${priceDeltaTotal === 1 ? "" : "s"})`
        : " (preços estáveis)";

    return NextResponse.json({
      success: true,
      stats,
      comparative,
      totalUniqueCompetitors: stats.competitorsChecked,
      updatedAt: stats.syncedAt,
      message: `Atualização concluída: ${stats.myListingsChecked} anúncio(s) próprio(s) e ${stats.competitorsChecked} concorrente(s) conferidos${deltaText}.`,
    });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[SyncBatch] Erro não tratado:", details);
    return NextResponse.json(
      {
        error: "Erro interno no servidor ao atualizar anúncios e concorrentes.",
        details,
      },
      { status: 500 }
    );
  }
}
