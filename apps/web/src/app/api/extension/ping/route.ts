import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/extension/auth";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Lightweight heartbeat used by the extension (no DB hit for extension tokens). */
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Token inválido ou expirado" }, { status: 401, headers: CORS_HEADERS });
  }
  return NextResponse.json(
    { ok: true, user: { id: user.id, email: user.email }, auth: user.source, serverTime: new Date().toISOString() },
    { headers: CORS_HEADERS }
  );
}
