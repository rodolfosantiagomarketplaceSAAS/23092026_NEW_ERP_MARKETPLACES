import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveUnifiedAuth } from "@/lib/auth/context";
import { buildComparativeResponseFromDb } from "@/lib/mercadolivre/radar-sync-engine";
import type { MarketplacePlatform } from "@crm/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const platform = (searchParams.get("platform") || "mercadolivre") as MarketplacePlatform;
    const search = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "all";

    const supabase = createSupabaseAdminClient();
    const responseData = await buildComparativeResponseFromDb(supabase, {
      platform,
      search,
      statusFilter,
      userId: ctx.userId,
    });

    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[API BI Comparative] Erro:", message);
    return NextResponse.json(
      { error: "Erro ao gerar comparativo de BI", details: message },
      { status: 500 }
    );
  }
}
