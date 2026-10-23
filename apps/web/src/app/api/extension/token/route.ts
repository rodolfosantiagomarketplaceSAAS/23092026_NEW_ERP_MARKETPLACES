import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issueExtensionToken } from "@/lib/extension/token";

export const dynamic = "force-dynamic";

/**
 * Issues a long-lived extension token for the user logged into the ERP (cookie session).
 * Called automatically by the extension's content script whenever the ERP is opened.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado no ERP" }, { status: 401 });
  }

  const { token, expiresAt } = issueExtensionToken(user.id, user.email ?? null);

  return NextResponse.json(
    {
      token,
      expiresAt,
      user: { id: user.id, email: user.email ?? null, name: user.user_metadata?.full_name ?? null },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
