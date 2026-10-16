import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { decryptSecret, safeEqual } from "@/lib/security/crypto";
import {
  exchangeAuthorizationCode,
  fetchMercadoLivreUser,
  getMercadoLivreConfig,
  MercadoLivreOAuthError,
} from "@/lib/integrations/mercadolivre/oauth";
import { logIntegrationAudit, saveMarketplaceIntegration } from "@/lib/services/marketplaceIntegrations";
import { ML_OAUTH_COOKIE, settingsRedirect } from "../shared";

export const dynamic = "force-dynamic";

interface OAuthTransaction {
  state: string;
  verifier: string;
  uid: string;
  exp: number;
}

function readTransaction(req: NextRequest): OAuthTransaction | null {
  const raw = req.cookies.get(ML_OAUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(decryptSecret(raw)) as OAuthTransaction;
  } catch {
    return null;
  }
}

/**
 * Step 2 of the OAuth flow: validates state (CSRF), binds the result to the same user who
 * started the flow, exchanges the code with PKCE and stores encrypted tokens for the tenant.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");

  if (sp.get("error")) return settingsRedirect(req, { error: "autorizacao_negada" });
  if (!code || !state) return settingsRedirect(req, { error: "callback_invalido" });

  const tx = readTransaction(req);
  if (!tx || tx.exp < Date.now()) return settingsRedirect(req, { error: "sessao_oauth_expirada" });
  if (!safeEqual(tx.state, state)) return settingsRedirect(req, { error: "state_invalido" });

  const ctx = await getAuthContext();
  if (!ctx || ctx.userId !== tx.uid) return settingsRedirect(req, { error: "sessao_divergente" });

  const config = getMercadoLivreConfig();
  if (!config) return settingsRedirect(req, { error: "ml_nao_configurado" });

  const scope = { userId: ctx.userId, organizationId: ctx.organizationId };
  const requestInfo = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };

  try {
    const tokens = await exchangeAuthorizationCode(config, code, tx.verifier);
    const mlUser = await fetchMercadoLivreUser(tokens.access_token);

    if (String(tokens.user_id) !== mlUser.seller_id) {
      return settingsRedirect(req, { error: "conta_divergente" });
    }

    await saveMarketplaceIntegration(scope, {
      platform: "mercadolivre",
      account_name: mlUser.account_name,
      seller_id: mlUser.seller_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope,
      metadata: {
        email: mlUser.email,
        permalink: mlUser.permalink,
        reputation: mlUser.reputation,
        country_id: mlUser.country_id,
        site_id: mlUser.site_id,
      },
    });

    await logIntegrationAudit(scope, "marketplace_connected", { platform: "mercadolivre", seller_id: mlUser.seller_id }, requestInfo);
    return settingsRedirect(req, { success: "ml_connected" });
  } catch (err) {
    const code = err instanceof MercadoLivreOAuthError ? err.code : "erro_interno";
    console.error("[ML OAuth] Falha no callback:", code, err instanceof Error ? err.message : err);
    await logIntegrationAudit(scope, "marketplace_connect_failed", { platform: "mercadolivre", code }, requestInfo);
    return settingsRedirect(req, { error: code === "invalid_grant" ? "codigo_expirado" : "falha_token" });
  }
}
