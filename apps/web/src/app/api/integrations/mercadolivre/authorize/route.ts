import { NextRequest, NextResponse } from "next/server";
import { canManageIntegrations, getAuthContext } from "@/lib/auth/context";
import { createPkcePair, encryptSecret, randomToken } from "@/lib/security/crypto";
import { buildAuthorizationUrl, getMercadoLivreConfig } from "@/lib/integrations/mercadolivre/oauth";
import { ML_OAUTH_COOKIE, ML_OAUTH_TTL_SECONDS, settingsRedirect } from "../shared";

export const dynamic = "force-dynamic";

/**
 * Step 1 of the OAuth flow: generates CSRF state + PKCE verifier, stores them in an
 * encrypted HttpOnly cookie bound to the current user and redirects to Mercado Livre.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.redirect(new URL("/login?redirect=/configuracoes", req.url));
  if (!canManageIntegrations(ctx)) return settingsRedirect(req, { error: "sem_permissao" });

  const config = getMercadoLivreConfig();
  if (!config) return settingsRedirect(req, { error: "ml_nao_configurado" });

  const state = randomToken(32);
  const pkce = createPkcePair();

  const cookieValue = encryptSecret(
    JSON.stringify({
      state,
      verifier: pkce.verifier,
      uid: ctx.userId,
      exp: Date.now() + ML_OAUTH_TTL_SECONDS * 1000,
    })
  );

  const res = NextResponse.redirect(buildAuthorizationUrl(config, state, pkce.challenge));
  res.cookies.set(ML_OAUTH_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/mercadolivre",
    maxAge: ML_OAUTH_TTL_SECONDS,
  });
  return res;
}
