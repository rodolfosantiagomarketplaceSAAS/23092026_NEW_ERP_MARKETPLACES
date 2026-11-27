import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { issueExtensionToken } from "@/lib/extension/token";

export const dynamic = "force-dynamic";

/**
 * Emite token assinado para a extensão Chrome exclusivamente para usuários autenticados
 * E com conta aprovada/ativa (`getAuthContext` fail-closed).
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado ou conta aguardando liberação." }, { status: 401 });
  }

  const { token, expiresAt } = issueExtensionToken(ctx.userId, ctx.email);

  return NextResponse.json(
    {
      token,
      expiresAt,
      user: { id: ctx.userId, email: ctx.email, role: ctx.role },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
