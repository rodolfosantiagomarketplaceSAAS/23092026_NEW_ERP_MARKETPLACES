/**
 * Mercado Livre OAuth 2.0 client (Authorization Code + PKCE + refresh token rotation).
 * Same flow used by Bling / Tiny: one app registered by the ERP, each seller authorizes it.
 * Docs: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
 */

const AUTH_BASE_URL = "https://auth.mercadolivre.com.br/authorization";
const API_BASE_URL = "https://api.mercadolibre.com";

export interface MercadoLivreConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  usePkce: boolean;
}

export interface MercadoLivreTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  scope?: string;
  token_type: string;
}

export interface MercadoLivreUser {
  seller_id: string;
  account_name: string;
  email?: string;
  permalink?: string;
  reputation?: string;
  country_id?: string;
  site_id?: string;
}

export class MercadoLivreOAuthError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = "MercadoLivreOAuthError";
  }
}

export function getMercadoLivreConfig(): MercadoLivreConfig | null {
  const clientId = process.env.ML_CLIENT_ID?.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  // Must match EXACTLY the redirect URI registered in the Mercado Livre DevCenter (HTTPS only).
  const redirectUri = process.env.ML_REDIRECT_URI?.trim() || (appUrl ? `${appUrl}/api/integrations/mercadolivre/callback` : "");

  if (!clientId || !clientSecret || !redirectUri) return null;

  return {
    clientId,
    clientSecret,
    redirectUri,
    usePkce: process.env.ML_USE_PKCE !== "false",
  };
}

export function buildAuthorizationUrl(config: MercadoLivreConfig, state: string, codeChallenge?: string): string {
  const url = new URL(AUTH_BASE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  if (config.usePkce && codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

async function requestToken(params: Record<string, string>): Promise<MercadoLivreTokens> {
  const res = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new MercadoLivreOAuthError(
      body.error || "token_request_failed",
      body.message || body.error_description || "Falha ao obter token do Mercado Livre.",
      res.status
    );
  }
  return body as MercadoLivreTokens;
}

export function exchangeAuthorizationCode(config: MercadoLivreConfig, code: string, codeVerifier?: string) {
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  };
  if (config.usePkce && codeVerifier) params.code_verifier = codeVerifier;
  return requestToken(params);
}

/** Refresh tokens are SINGLE-USE on Mercado Livre: always persist the new refresh_token. */
export function refreshAccessToken(config: MercadoLivreConfig, refreshToken: string) {
  return requestToken({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });
}

export async function fetchMercadoLivreUser(accessToken: string): Promise<MercadoLivreUser> {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new MercadoLivreOAuthError(
      body.error || "invalid_token",
      body.message || "Token inválido ou expirado no Mercado Livre.",
      res.status
    );
  }

  const user = await res.json();
  return {
    seller_id: String(user.id),
    account_name: user.nickname || `Vendedor ${user.id}`,
    email: user.email,
    permalink: user.permalink,
    reputation: user.seller_reputation?.level_id || undefined,
    country_id: user.country_id,
    site_id: user.site_id,
  };
}
