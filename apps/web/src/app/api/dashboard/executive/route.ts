import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import {
  DASHBOARD_CACHE_TTL_MS,
  getExecutiveDashboardData,
} from "@/lib/mercadolivre/executive-dashboard";

export const dynamic = "force-dynamic";

function getTodayBrazilIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Não autenticado." },
      { status: 401 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const todayBr = getTodayBrazilIso();

  const rawFrom = sp.get("from")?.slice(0, 10) ?? "";
  const rawTo = sp.get("to")?.slice(0, 10) ?? "";
  const selectedStore = sp.get("store")?.trim() || "all";
  const forceRefresh = sp.get("force") === "true";

  // Default window: last 30 days
  let fromDate = ISO_DATE_RE.test(rawFrom) ? rawFrom : addDaysIso(todayBr, -29);
  let toDate = ISO_DATE_RE.test(rawTo) ? rawTo : todayBr;

  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  // Guardrail: cap range to 180 days to protect Supabase free-tier compute/egress
  const maxStart = addDaysIso(toDate, -179);
  if (fromDate < maxStart) {
    fromDate = maxStart;
  }

  try {
    const payload = await getExecutiveDashboardData({
      ctx,
      fromDate,
      toDate,
      selectedStore,
      forceRefresh,
    });

    const maxAgeSec = Math.round(DASHBOARD_CACHE_TTL_MS / 1000);
    const cacheHeader = forceRefresh
      ? "no-store"
      : `private, max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 2}`;

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": cacheHeader,
      },
    });
  } catch (err) {
    console.error("[ExecutiveDashboard] Erro ao consolidar dados:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro interno ao consolidar o Dashboard Executivo.",
      },
      { status: 500 }
    );
  }
}
