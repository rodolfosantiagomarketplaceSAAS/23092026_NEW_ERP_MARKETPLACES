import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/security/crypto";
import { refreshExpiringMercadoLivreTokens } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Proactive token refresh (Vercel Cron). Keeps Mercado Livre refresh tokens alive
 * (they expire after ~6 months unused) so sellers never need to reconnect.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const result = await refreshExpiringMercadoLivreTokens(2 * 60 * 60 * 1000);
  return NextResponse.json({ success: true, ...result });
}
