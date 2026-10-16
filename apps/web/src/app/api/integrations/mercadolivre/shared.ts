import { NextRequest, NextResponse } from "next/server";

export const ML_OAUTH_COOKIE = "ml_oauth_tx";
export const ML_OAUTH_TTL_SECONDS = 10 * 60;

/** Redirects back to the settings page using only whitelisted codes (no reflected messages). */
export function settingsRedirect(req: NextRequest, params: { success?: string; error?: string }) {
  const url = new URL("/configuracoes", req.url);
  url.searchParams.set("tab", "marketplaces");
  if (params.success) url.searchParams.set("success", params.success);
  if (params.error) url.searchParams.set("error", params.error);

  const res = NextResponse.redirect(url);
  res.cookies.set(ML_OAUTH_COOKIE, "", { path: "/api/integrations/mercadolivre", maxAge: 0 });
  return res;
}
