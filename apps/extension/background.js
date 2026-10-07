/**
 * BACKGROUND SERVICE WORKER - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * Gerencia a comunicação segura com o endpoint /api/competitors/sync do Next.js
 */

/**
 * Normaliza a URL do ERP:
 * - Garante protocolo (http:// ou https://)
 * - Remove barras finais
 * - Converte domínios Vercel para HTTPS obrigatoriamente
 */
function normalizeErpUrl(rawUrl) {
  let url = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!url) return "http://localhost:3000";

  // Se o usuário digitou sem protocolo (ex: meu-erp.vercel.app)
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Se for endereço Vercel, força https
  if (url.includes(".vercel.app") && url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }

  return url;
}

/**
 * Recupera configurações mesclando local storage e sync storage
 */
async function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["erpUrl", "apiToken"], (localRes) => {
      chrome.storage.sync.get(["erpUrl", "apiToken"], (syncRes) => {
        const erpUrl = localRes?.erpUrl || syncRes?.erpUrl || "";
        const apiToken = localRes?.apiToken || syncRes?.apiToken || "";
        resolve({ erpUrl, apiToken });
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[ERP Background Worker] Extensão inicializada.");
  // Não sobrescreve configurações se já existirem
  const current = await getStoredConfig();
  if (!current.erpUrl) {
    chrome.storage.local.set({ erpUrl: "http://localhost:3000" });
    try {
      chrome.storage.sync.set({ erpUrl: "http://localhost:3000" });
    } catch {}
  }
});

/**
 * Listener de Mensagens Internas da Extensão
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_COMPETITOR") {
    handleSyncCompetitor(request.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Mantém o canal aberto para resposta assíncrona
  }

  if (request.action === "TEST_CONNECTION") {
    handleTestConnection(request.erpUrl, request.apiToken)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Despacha o POST para a API do ERP
 */
async function handleSyncCompetitor(payload) {
  const config = await getStoredConfig();
  const erpUrl = normalizeErpUrl(config.erpUrl);
  const apiToken = config.apiToken?.trim() || "";

  const endpoint = `${erpUrl}/api/competitors/sync`;

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiToken) {
    headers["Authorization"] = `Bearer ${apiToken}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errDetails = data.details
        ? typeof data.details === "object"
          ? JSON.stringify(data.details)
          : data.details
        : "";
      throw new Error(data.error || `Erro HTTP ${response.status}: ${response.statusText} ${errDetails}`);
    }

    return { success: true, data };
  } catch (error) {
    console.error("[ERP Background Worker] Erro no fetch de sync:", error);
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      throw new Error(`Não foi possível conectar ao ERP em ${erpUrl}. Verifique se a URL está correta e com HTTPS (caso online na Vercel).`);
    }
    throw error;
  }
}

/**
 * Valida a conexão com o ERP
 */
async function handleTestConnection(erpUrl, apiToken) {
  const url = normalizeErpUrl(erpUrl);
  const token = apiToken?.trim() || "";

  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${url}/api/my-listings?platform=mercadolivre&limit=1`, {
      method: "GET",
      headers,
    });

    if (response.ok) {
      return {
        success: true,
        message: token
          ? `Conexão com o ERP (${url}) autenticada com sucesso!`
          : `Conexão com o ERP (${url}) estabelecida com sucesso!`,
      };
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (err) {
    console.error("[ERP Background Worker] Erro no teste de conexão:", err);
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      throw new Error(`Falha de conexão em ${url}. Verifique se a URL está acessível e possui HTTPS válido.`);
    }
    throw new Error(`Falha ao conectar no ERP: ${err.message}`);
  }
}
