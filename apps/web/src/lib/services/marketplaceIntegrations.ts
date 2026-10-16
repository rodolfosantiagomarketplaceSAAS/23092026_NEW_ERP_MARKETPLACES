import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import {
  fetchMercadoLivreUser,
  getMercadoLivreConfig,
  MercadoLivreOAuthError,
  refreshAccessToken,
} from "@/lib/integrations/mercadolivre/oauth";

export type MarketplacePlatform = "mercadolivre" | "shopee";

/** Ownership scope of marketplace accounts: the organization (tenant), or the user when no company profile exists. */
export interface IntegrationScope {
  userId: string;
  organizationId: string | null;
}

export interface MarketplaceAccountInfo {
  id: string;
  platform: MarketplacePlatform;
  account_name: string;
  seller_id: string;
  is_active: boolean;
  connected_at: string;
  token_expires_at?: string | null;
  metadata?: Record<string, any>;
  status: "online" | "expired" | "reauth_required";
}

const TABLE = "marketplace_integrations";
const PUBLIC_COLUMNS = "id, platform, account_name, seller_id, is_active, status, created_at, token_expires_at, metadata";
const TOKEN_COLUMNS = "id, platform, seller_id, access_token, refresh_token, token_expires_at, status";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REFRESH_LOCK_MS = 30 * 1000;

interface TokenRow {
  id: string;
  platform: MarketplacePlatform;
  seller_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
}

function applyScope<T extends { eq: Function; is: Function }>(query: T, scope: IntegrationScope): T {
  return scope.organizationId
    ? query.eq("organization_id", scope.organizationId)
    : query.eq("user_id", scope.userId).is("organization_id", null);
}

async function resolveScope(scope?: IntegrationScope): Promise<IntegrationScope | null> {
  if (scope) return scope;
  const ctx = await getAuthContext();
  return ctx ? { userId: ctx.userId, organizationId: ctx.organizationId } : null;
}

/** Validates an access token against /users/me and returns seller data. */
export async function validateMercadoLivreToken(accessToken: string) {
  return fetchMercadoLivreUser(accessToken.trim());
}

/** Creates or updates a marketplace account. Tokens are always encrypted at rest. */
export async function saveMarketplaceIntegration(
  scope: IntegrationScope,
  params: {
    platform: MarketplacePlatform;
    account_name: string;
    seller_id: string;
    access_token: string;
    refresh_token?: string;
    token_expires_at?: string;
    scopes?: string;
    metadata?: Record<string, any>;
  }
) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const record = {
    user_id: scope.userId,
    organization_id: scope.organizationId,
    platform: params.platform,
    account_name: params.account_name,
    seller_id: params.seller_id,
    access_token: encryptSecret(params.access_token),
    refresh_token: params.refresh_token ? encryptSecret(params.refresh_token) : null,
    token_expires_at: params.token_expires_at ?? null,
    scopes: params.scopes ?? null,
    metadata: params.metadata ?? {},
    is_active: true,
    status: "active",
    last_error: null,
    refresh_lock_until: null,
    last_refreshed_at: now,
    updated_at: now,
  };

  const { data: existing } = await applyScope(
    admin.from(TABLE).select("id").eq("platform", params.platform).eq("seller_id", params.seller_id),
    scope
  ).maybeSingle();

  const { data, error } = existing
    ? await admin.from(TABLE).update(record).eq("id", existing.id).select(PUBLIC_COLUMNS).single()
    : await admin.from(TABLE).insert(record).select(PUBLIC_COLUMNS).single();

  if (error || !data) {
    console.error("[Integrations] Falha ao salvar integração:", error?.message);
    throw new Error("Não foi possível salvar a conta conectada. Verifique se a migration foi aplicada.");
  }

  return toAccountInfo(data);
}

function toAccountInfo(item: any): MarketplaceAccountInfo {
  const expired = item.token_expires_at ? Date.parse(item.token_expires_at) < Date.now() : false;
  return {
    id: item.id,
    platform: item.platform,
    account_name: item.account_name,
    seller_id: item.seller_id,
    is_active: item.is_active,
    connected_at: item.created_at,
    token_expires_at: item.token_expires_at,
    metadata: item.metadata,
    // Expired access tokens are refreshed transparently; only a dead refresh token needs user action.
    status: item.status === "reauth_required" ? "reauth_required" : expired && item.platform !== "mercadolivre" ? "expired" : "online",
  };
}

/** Lists accounts of the tenant without ever returning tokens. */
export async function getMarketplaceIntegrations(scope: IntegrationScope): Promise<MarketplaceAccountInfo[]> {
  const { data, error } = await applyScope(
    createSupabaseAdminClient().from(TABLE).select(PUBLIC_COLUMNS).or("is_active.eq.true,status.eq.reauth_required"),
    scope
  ).order("created_at", { ascending: true });

  if (error) {
    console.error("[Integrations] Falha ao listar integrações:", error.message);
    return [];
  }
  return (data ?? []).map(toAccountInfo);
}

/**
 * Returns a valid access token for internal ERP use. Mercado Livre tokens (6h) are refreshed
 * automatically a few minutes before expiry, exactly like Bling/Tiny do.
 */
export async function getActiveMarketplaceToken(
  platform: MarketplacePlatform,
  scope?: IntegrationScope,
  sellerId?: string
): Promise<string | null> {
  const resolved = await resolveScope(scope);
  if (!resolved) return null;

  let query = applyScope(
    createSupabaseAdminClient()
      .from(TABLE)
      .select(TOKEN_COLUMNS)
      .eq("platform", platform)
      .eq("is_active", true)
      .eq("status", "active"),
    resolved
  );
  if (sellerId) query = query.eq("seller_id", sellerId);

  const { data } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;

  const row = data as TokenRow;
  if (platform !== "mercadolivre") return decryptSecret(row.access_token);

  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return decryptSecret(row.access_token);

  return refreshMercadoLivreIntegration(row.id);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Refreshes a Mercado Livre account with a DB lock: refresh tokens are single-use,
 * so two concurrent serverless invocations must never refresh the same account.
 */
export async function refreshMercadoLivreIntegration(integrationId: string): Promise<string | null> {
  const config = getMercadoLivreConfig();
  if (!config) throw new Error("Integração Mercado Livre não configurada no servidor (ML_CLIENT_ID / ML_CLIENT_SECRET).");

  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: locked } = await admin
    .from(TABLE)
    .update({ refresh_lock_until: new Date(Date.now() + REFRESH_LOCK_MS).toISOString() })
    .eq("id", integrationId)
    .eq("status", "active")
    .or(`refresh_lock_until.is.null,refresh_lock_until.lt."${nowIso}"`)
    .select(TOKEN_COLUMNS)
    .maybeSingle();

  if (!locked) {
    // Another instance is refreshing: wait and reuse its result.
    await sleep(1500);
    const { data: row } = await admin.from(TABLE).select(TOKEN_COLUMNS).eq("id", integrationId).maybeSingle();
    if (row?.status === "active" && row.token_expires_at && Date.parse(row.token_expires_at) > Date.now()) {
      return decryptSecret(row.access_token);
    }
    return null;
  }

  const row = locked as TokenRow;
  if (!row.refresh_token) {
    await markReauthRequired(integrationId, "Refresh token ausente.");
    return null;
  }

  try {
    const tokens = await refreshAccessToken(config, decryptSecret(row.refresh_token));
    const now = new Date();
    await admin
      .from(TABLE)
      .update({
        access_token: encryptSecret(tokens.access_token),
        refresh_token: encryptSecret(tokens.refresh_token),
        token_expires_at: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(),
        scopes: tokens.scope ?? null,
        last_refreshed_at: now.toISOString(),
        refresh_lock_until: null,
        last_error: null,
        updated_at: now.toISOString(),
      })
      .eq("id", integrationId);
    return tokens.access_token;
  } catch (err) {
    const isPermanent =
      err instanceof MercadoLivreOAuthError && (err.code === "invalid_grant" || err.status === 400 || err.status === 401);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error(`[Integrations] Falha ao renovar token ML (${integrationId}):`, message);

    if (isPermanent) {
      await markReauthRequired(integrationId, message);
    } else {
      await admin.from(TABLE).update({ refresh_lock_until: null, last_error: message }).eq("id", integrationId);
    }
    return null;
  }
}

async function markReauthRequired(integrationId: string, reason: string) {
  await createSupabaseAdminClient()
    .from(TABLE)
    .update({ status: "reauth_required", refresh_lock_until: null, last_error: reason })
    .eq("id", integrationId);
}

/** Proactive refresh (cron): keeps refresh tokens alive and access tokens warm. */
export async function refreshExpiringMercadoLivreTokens(withinMs = 60 * 60 * 1000) {
  const { data } = await createSupabaseAdminClient()
    .from(TABLE)
    .select("id")
    .eq("platform", "mercadolivre")
    .eq("is_active", true)
    .eq("status", "active")
    .lt("token_expires_at", new Date(Date.now() + withinMs).toISOString());

  let refreshed = 0;
  let failed = 0;
  for (const { id } of data ?? []) {
    (await refreshMercadoLivreIntegration(id)) ? refreshed++ : failed++;
  }
  return { total: data?.length ?? 0, refreshed, failed };
}

/** Removes the account and its tokens. Users can also revoke the app at Mercado Livre > Segurança > Aplicativos. */
export async function disconnectMarketplaceAccount(
  scope: IntegrationScope,
  params: { platform: MarketplacePlatform; integrationId?: string; sellerId?: string }
) {
  let query = applyScope(createSupabaseAdminClient().from(TABLE).delete().eq("platform", params.platform), scope);
  if (params.integrationId) query = query.eq("id", params.integrationId);
  if (params.sellerId) query = query.eq("seller_id", params.sellerId);

  const { error } = await query;
  if (error) throw new Error("Falha ao desconectar a conta.");
  return { success: true };
}

export async function logIntegrationAudit(
  scope: IntegrationScope,
  eventType: string,
  details: Record<string, unknown>,
  request?: { ip?: string | null; userAgent?: string | null }
) {
  try {
    await createSupabaseAdminClient().from("auth_audit_logs").insert({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      event_type: eventType,
      ip_address: request?.ip ?? null,
      user_agent: request?.userAgent ?? null,
      details,
    });
  } catch {
    // Audit failures must never break the main flow
  }
}
