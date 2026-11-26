import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { resolveRequestUser } from "@/lib/extension/auth";
import { buildComparativeResponseFromDb } from "@/lib/mercadolivre/radar-sync-engine";
import type { MarketplacePlatform } from "@crm/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = (searchParams.get("platform") || "mercadolivre") as MarketplacePlatform;
    const search = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "all";

    const authUser = await resolveRequestUser(req);
    const webCtx = !authUser ? await getAuthContext().catch(() => null) : null;
    const userId = authUser?.id ?? webCtx?.userId ?? null;

    const supabase = createSupabaseAdminClient();
    const responseData = await buildComparativeResponseFromDb(supabase, {
      platform,
      search,
      statusFilter,
      userId,
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
