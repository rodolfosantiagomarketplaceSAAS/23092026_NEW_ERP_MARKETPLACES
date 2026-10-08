import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface MarketplaceAccountInfo {
  platform: "mercadolivre" | "shopee";
  account_name: string;
  seller_id: string;
  is_active: boolean;
  connected_at: string;
  token_expires_at?: string | null;
  metadata?: Record<string, any>;
  status: "online" | "expired" | "offline";
}

// Armazenamento em memória seguro no servidor (garante funcionamento resiliente mesmo antes da migration)
const inMemoryIntegrations = new Map<string, {
  platform: "mercadolivre" | "shopee";
  account_name: string;
  seller_id: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
  is_active: boolean;
  metadata?: Record<string, any>;
  connected_at: string;
}>();

// ID padrão de demonstração / usuário mestre caso não haja autenticação ativa
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Consulta a API oficial do Mercado Livre para validar um Access Token e obter dados do lojista
 */
export async function validateMercadoLivreToken(accessToken: string) {
  const token = accessToken.trim();
  const res = await fetch("https://api.mercadolibre.com/users/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    let msg = "Token inválido ou expirado no Mercado Livre";
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.message) msg = errJson.message;
    } catch {
      // Ignora erro de JSON
    }
    throw new Error(msg);
  }

  const user = await res.json();
  return {
    seller_id: String(user.id),
    account_name: user.nickname || `Vendedor ${user.id}`,
    email: user.email,
    permalink: user.permalink,
    reputation: user.seller_reputation?.level_id || "platinum",
    country_id: user.country_id,
  };
}

/**
 * Salva ou atualiza a integração de uma conta de Marketplace
 */
export async function saveMarketplaceIntegration(params: {
  userId?: string;
  platform: "mercadolivre" | "shopee";
  account_name: string;
  seller_id: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
  metadata?: Record<string, any>;
}) {
  const userId = params.userId || DEFAULT_USER_ID;
  const key = `${userId}:${params.platform}:${params.seller_id}`;

  const payload = {
    platform: params.platform,
    account_name: params.account_name,
    seller_id: params.seller_id,
    access_token: params.access_token,
    refresh_token: params.refresh_token,
    token_expires_at: params.token_expires_at,
    is_active: true,
    metadata: params.metadata || {},
    connected_at: new Date().toISOString(),
  };

  // Salva na memória do servidor para acesso imediato
  inMemoryIntegrations.set(key, payload);

  // Tenta persistir no Supabase (se a tabela marketplace_integrations já tiver sido criada)
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("marketplace_integrations").upsert(
      {
        user_id: userId,
        platform: params.platform,
        account_name: params.account_name,
        seller_id: params.seller_id,
        access_token: params.access_token,
        refresh_token: params.refresh_token || null,
        token_expires_at: params.token_expires_at || null,
        is_active: true,
        metadata: params.metadata || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, platform, seller_id" }
    );

    if (error) {
      console.warn("[Integrations] Supabase upsert notice (fallback em memória ativo):", error.message);
    }
  } catch (err) {
    console.warn("[Integrations] Falha de escrita no Supabase:", err);
  }

  return {
    platform: params.platform,
    account_name: params.account_name,
    seller_id: params.seller_id,
    is_active: true,
    connected_at: payload.connected_at,
    status: "online" as const,
    metadata: params.metadata,
  };
}

/**
 * Lista as integrações ativas (sem vazar access_tokens confidenciais)
 */
export async function getMarketplaceIntegrations(userId: string = DEFAULT_USER_ID): Promise<MarketplaceAccountInfo[]> {
  const accounts: MarketplaceAccountInfo[] = [];

  // 1. Tenta buscar do Supabase
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("marketplace_integrations")
      .select("platform, account_name, seller_id, is_active, created_at, token_expires_at, metadata")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (!error && Array.isArray(data) && data.length > 0) {
      for (const item of data) {
        accounts.push({
          platform: item.platform,
          account_name: item.account_name,
          seller_id: item.seller_id,
          is_active: item.is_active,
          connected_at: item.created_at,
          token_expires_at: item.token_expires_at,
          metadata: item.metadata,
          status: "online",
        });
      }
    }
  } catch {
    // Continua para o fallback de memória
  }

  // 2. Mescla com os dados em memória (garante que funciona de imediato)
  inMemoryIntegrations.forEach((item, key) => {
    if (key.startsWith(`${userId}:`) && item.is_active) {
      const exists = accounts.find((a) => a.platform === item.platform && a.seller_id === item.seller_id);
      if (!exists) {
        accounts.push({
          platform: item.platform,
          account_name: item.account_name,
          seller_id: item.seller_id,
          is_active: item.is_active,
          connected_at: item.connected_at,
          token_expires_at: item.token_expires_at,
          metadata: item.metadata,
          status: "online",
        });
      }
    }
  });

  return accounts;
}

/**
 * Obtém o token de acesso de uma plataforma para uso interno do ERP
 */
export async function getActiveMarketplaceToken(platform: "mercadolivre" | "shopee", userId: string = DEFAULT_USER_ID): Promise<string | null> {
  // Procura na memória
  let foundToken: string | null = null;
  inMemoryIntegrations.forEach((item, key) => {
    if (!foundToken && key.startsWith(`${userId}:${platform}:`) && item.is_active && item.access_token) {
      foundToken = item.access_token;
    }
  });

  if (foundToken) {
    return foundToken;
  }

  // Procura no Supabase
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("marketplace_integrations")
      .select("access_token")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.access_token) {
      return data.access_token;
    }
  } catch {
    // Ignora
  }

  // Fallback para variáveis de ambiente caso configuradas
  if (platform === "mercadolivre") {
    return process.env.ML_ACCESS_TOKEN || process.env.MERCADOLIVRE_ACCESS_TOKEN || null;
  }

  return null;
}

/**
 * Desconecta uma conta de Marketplace
 */
export async function disconnectMarketplaceAccount(params: {
  userId?: string;
  platform: "mercadolivre" | "shopee";
  sellerId?: string;
}) {
  const userId = params.userId || DEFAULT_USER_ID;

  // Remove da memória
  inMemoryIntegrations.forEach((item, key) => {
    if (key.startsWith(`${userId}:${params.platform}:`)) {
      if (!params.sellerId || item.seller_id === params.sellerId) {
        item.is_active = false;
        inMemoryIntegrations.delete(key);
      }
    }
  });

  // Remove/Inativa no Supabase
  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("marketplace_integrations")
      .delete()
      .eq("user_id", userId)
      .eq("platform", params.platform);

    if (params.sellerId) {
      query = query.eq("seller_id", params.sellerId);
    }

    await query;
  } catch (err) {
    console.warn("[Integrations] Falha ao deletar do Supabase:", err);
  }

  return { success: true };
}
