/**
 * BACKGROUND SERVICE WORKER - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * - Conexão automática: recebe o token do ERP (content script na aba do ERP logado)
 * - Heartbeat periódico (chrome.alarms) + badge no ícone indicando status
 * - Proxy de todas as chamadas à API do ERP (imune a CORS das páginas)
 */

const DEFAULT_ERP_URL = "http://localhost:3000";
const HEARTBEAT_ALARM = "erp-heartbeat";
const HEARTBEAT_MINUTES = 5;

function normalizeErpUrl(rawUrl) {
  let url = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!url) return DEFAULT_ERP_URL;
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = `https://${url}`;
  if (url.includes(".vercel.app") && url.startsWith("http://")) url = url.replace("http://", "https://");
  return url;
}

async function getStoredConfig() {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(["erpUrl", "apiToken", "connectedUser"]),
    chrome.storage.sync.get(["erpUrl", "apiToken"]).catch(() => ({})),
  ]);
  return {
    erpUrl: normalizeErpUrl(local.erpUrl || sync.erpUrl),
    apiToken: (local.apiToken || sync.apiToken || "").trim(),
    connectedUser: local.connectedUser || null,
  };
}

function authHeaders(apiToken, extra = {}) {
  return apiToken ? { ...extra, Authorization: `Bearer ${apiToken}` } : extra;
}

function setBadge(online) {
  chrome.action.setBadgeText({ text: online ? "ON" : "!" });
  chrome.action.setBadgeBackgroundColor({ color: online ? "#10B981" : "#EF4444" });
  chrome.action.setTitle({
    title: online ? "ERP Marketplaces - Conectado" : "ERP Marketplaces - Desconectado (abra o ERP logado)",
  });
}

async function saveStatus(status) {
  await chrome.storage.local.set({ connectionStatus: { ...status, checkedAt: new Date().toISOString() } });
  setBadge(status.online);
  return status;
}

/** Valida o token no ERP. Não depende de banco para tokens da extensão (rápido). */
async function heartbeat(override = {}) {
  const config = await getStoredConfig();
  const erpUrl = normalizeErpUrl(override.erpUrl || config.erpUrl);
  const apiToken = (override.apiToken ?? config.apiToken).trim();

  if (!apiToken) {
    return saveStatus({ online: false, erpUrl, reason: "no_token", error: "Abra o ERP logado para conectar." });
  }

  try {
    const res = await fetch(`${erpUrl}/api/extension/ping`, { headers: authHeaders(apiToken) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return saveStatus({ online: true, erpUrl, user: data.user, auth: data.auth });
    }
    return saveStatus({
      online: false,
      erpUrl,
      reason: res.status === 401 ? "unauthorized" : "http_error",
      error: res.status === 401 ? "Sessão expirada. Abra o ERP logado para reconectar." : `Erro HTTP ${res.status}`,
    });
  } catch {
    return saveStatus({ online: false, erpUrl, reason: "network", error: `ERP inacessível em ${erpUrl}` });
  }
}

function ensureHeartbeatAlarm() {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { erpUrl } = await chrome.storage.local.get(["erpUrl"]);
  if (!erpUrl) await chrome.storage.local.set({ erpUrl: DEFAULT_ERP_URL });
  ensureHeartbeatAlarm();
  heartbeat();
});

chrome.runtime.onStartup.addListener(() => {
  ensureHeartbeatAlarm();
  heartbeat();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) heartbeat();
});

/** Pareamento automático: o content script do ERP envia o token emitido para o usuário logado. */
async function handleErpSession({ erpUrl, token, user }) {
  const normalized = normalizeErpUrl(erpUrl);
  await chrome.storage.local.set({
    erpUrl: normalized,
    apiToken: token,
    connectedUser: user || null,
    connectedAt: new Date().toISOString(),
  });
  return heartbeat({ erpUrl: normalized, apiToken: token });
}

async function postToErp(path, payload, override = {}) {
  const config = await getStoredConfig();
  const erpUrl = normalizeErpUrl(override.erpUrl || config.erpUrl);

  let response;
  try {
    response = await fetch(`${erpUrl}${path}`, {
      method: "POST",
      headers: authHeaders(config.apiToken, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Não foi possível conectar ao ERP em ${erpUrl}. Verifique se o servidor está online.`);
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    await saveStatus({ online: false, erpUrl, reason: "unauthorized", error: data.error });
    throw new Error(data.error || "Extensão desconectada. Abra o ERP logado para reconectar.");
  }
  if (!response.ok) {
    const details = data.details ? (typeof data.details === "object" ? JSON.stringify(data.details) : data.details) : "";
    throw new Error(data.error ? `${data.error} ${details}`.trim() : `Erro HTTP ${response.status}`);
  }
  return { data, erpUrl };
}

async function handleSyncCompetitor(payload) {
  const { data } = await postToErp("/api/competitors/sync", payload);
  return { success: true, data };
}

async function handleSyncSearchItems(rawErpUrl, payload) {
  const { data, erpUrl } = await postToErp("/api/bi/market-search/bulk-sync", payload, { erpUrl: rawErpUrl });
  return {
    success: true,
    count: payload.items?.length || 0,
    query: payload.query,
    erpUrl,
    redirectUrl:
      data.redirectUrl ||
      `/inteligencia?q=${encodeURIComponent(payload.query)}&platform=${payload.platform || "mercadolivre"}`,
    ...data,
  };
}

async function handleGetMyListings(platform, query = "") {
  const config = await getStoredConfig();
  const params = new URLSearchParams();
  if (platform && platform !== "all") {
    params.set("platform", platform);
  } else if (platform === "all") {
    params.set("platform", "all");
  }
  params.set("limit", "1000");
  if (query) {
    params.set("q", query);
  }

  const res = await fetch(`${config.erpUrl}/api/my-listings?${params.toString()}`, {
    headers: authHeaders(config.apiToken),
  });
  if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
  const data = await res.json();
  return { success: true, items: Array.isArray(data.items) ? data.items : [], total: data.total || 0 };
}

async function handleInspectCompetitorLink(payload) {
  const { permalink, external_id, platform = "mercadolivre", my_listing_id, competitor_id } = payload || {};
  let extracted = null;

  // 1. Tenta carregar o HTML da página do anúncio através do link do concorrente (sem bloqueio de CORS)
  if (permalink) {
    try {
      const res = await fetch(permalink, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (res.ok) {
        const html = await res.text();
        const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        let ldObj = null;
        if (ldMatch) {
          try {
            ldObj = JSON.parse(ldMatch[1]);
          } catch {}
        }

        const offer = ldObj?.offers ? (Array.isArray(ldObj.offers) ? ldObj.offers[0] : ldObj.offers) : null;
        const price = offer?.price ? parseFloat(offer.price) : 0;

        let shippingType = "padrao";
        if (html.includes("Enviado pelo FULL") || html.includes("ui-pdp-icon--full")) {
          shippingType = "ml_full";
        } else if (html.includes("Chegará hoje") || html.includes("Flex")) {
          shippingType = "ml_flex";
        }

        let promoBadge = null;
        const discountMatch = html.match(/(\d+%\s*OFF)/i);
        if (discountMatch) {
          promoBadge = discountMatch[1];
        } else if (html.includes("OFERTA DO DIA")) {
          promoBadge = "Oferta do Dia";
        }

        if (price > 0 || ldObj?.name) {
          extracted = {
            title: ldObj?.name || null,
            current_price: price,
            seller_name: offer?.seller?.name || null,
            shipping_type: shippingType,
            promo_badge: promoBadge,
            thumbnail_url: ldObj?.image ? (Array.isArray(ldObj.image) ? ldObj.image[0] : ldObj.image) : null,
            permalink,
            external_id,
          };
        }
      }
    } catch (e) {
      console.warn("[Background] Erro ao buscar HTML do link:", e);
    }
  }

  // 2. Envia para o ERP verificar e sincronizar anúncio próprio e concorrente
  const { data } = await postToErp("/api/bi/refresh-comparison", {
    my_listing_id,
    competitor_id,
    competitor_permalink: permalink,
    competitor_external_id: external_id,
    platform,
    verified_data: extracted,
  });

  return { success: true, ...data };
}

const handlers = {
  ERP_SESSION: (req) => handleErpSession(req),
  SYNC_COMPETITOR: (req) => handleSyncCompetitor(req.payload),
  SYNC_SEARCH_ITEMS: (req) => handleSyncSearchItems(req.erpUrl, req.payload),
  GET_MY_LISTINGS: (req) => handleGetMyListings(req.platform, req.query),
  INSPECT_COMPETITOR_LINK: (req) => handleInspectCompetitorLink(req.payload),
  GET_STATUS: async () => {
    const [{ connectionStatus }, config] = await Promise.all([
      chrome.storage.local.get(["connectionStatus"]),
      getStoredConfig(),
    ]);
    return { ...config, apiToken: undefined, hasToken: !!config.apiToken, status: connectionStatus || null };
  },
  TEST_CONNECTION: async (req) => {
    const status = await heartbeat({ erpUrl: req.erpUrl, apiToken: req.apiToken });
    return status.online
      ? { success: true, message: `Conectado ao ERP (${status.erpUrl}) como ${status.user?.email || "usuário"}.`, status }
      : { success: false, error: status.error, status };
  },
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handler = handlers[request?.action];
  if (!handler) return false;

  Promise.resolve(handler(request))
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ success: false, error: err.message }));
  return true; // resposta assíncrona
});
