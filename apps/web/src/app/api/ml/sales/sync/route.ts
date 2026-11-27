import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { syncMercadoLivreSales } from "@/lib/mercadolivre/sales-sync";
import { syncSalesRequestSchema } from "@/lib/validators/ml-sales";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/ml/sales/sync
 * Dispara a sincronização de pedidos do período consumindo EXCLUSIVAMENTE endpoints HTTP GET
 * na API oficial do Mercado Livre / Mercado Pago e salvando via Upsert no Supabase.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Sessão expirada. Faça login novamente." },
      { status: 401 }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = syncSalesRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message || "Parâmetros de período inválidos.",
      },
      { status: 400 }
    );
  }

  try {
    const todayBr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    let effectiveFrom = parsed.data.from || todayBr;
    let effectiveTo = parsed.data.to || todayBr;

    if (parsed.data.allSales) {
      const [y, m, d] = todayBr.split("-").map(Number);
      const oneYearAgo = new Date(Date.UTC(y - 1, m - 1, d, 12, 0, 0));
      effectiveFrom = oneYearAgo.toISOString().slice(0, 10);
      effectiveTo = todayBr;
    }

    const result = await syncMercadoLivreSales({
      scope: { userId: ctx.userId, organizationId: ctx.organizationId },
      from: effectiveFrom,
      to: effectiveTo,
      sellerAccountId: parsed.data.sellerAccountId,
      analysisMode: parsed.data.analysisMode,
      reconcileShippingDates: parsed.data.reconcileShippingDates,
    });

    if (!result.success && result.accountsSynced === 0) {
      return NextResponse.json(
        {
          ...result,
          error:
            result.errors[0]?.message ||
            "Não foi possível sincronizar as vendas do Mercado Livre.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro interno ao sincronizar vendas do Mercado Livre.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
