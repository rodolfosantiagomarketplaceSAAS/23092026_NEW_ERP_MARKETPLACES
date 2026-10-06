/**
 * BACKGROUND SERVICE WORKER - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * Gerencia a comunicação segura com o endpoint /api/competitors/sync do Next.js
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ERP Background Worker] Extensão instalada com sucesso.");

  // Inicializa configurações padrão caso vazias
  chrome.storage.sync.get(["erpUrl", "apiToken"], (res) => {
    if (!res.erpUrl) {
      chrome.storage.sync.set({ erpUrl: "http://localhost:3000" });
    }
  });
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
  const config = await chrome.storage.sync.get(["erpUrl", "apiToken"]);
  const erpUrl = (config.erpUrl || "http://localhost:3000").replace(/\/$/, "");
  const apiToken = config.apiToken?.trim() || "";

  const endpoint = `${erpUrl}/api/competitors/sync`;

  const headers = {
    "Content-Type": "application/json",
  };

  // Se o usuário configurou Bearer Token, anexa. Se não, o endpoint usa o usuário dev/padrão
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
      throw new Error(`Não foi possível conectar ao ERP em ${erpUrl}. Certifique-se de que o sistema está em execução (npm run dev).`);
    }
    throw error;
  }
}

/**
 * Valida a conexão com o ERP
 */
async function handleTestConnection(erpUrl, apiToken) {
  const url = (erpUrl || "http://localhost:3000").replace(/\/$/, "");
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
          ? "Conexão com o ERP autenticada com sucesso!"
          : "Conexão com o ERP estabelecida com sucesso (Modo Local/Dev)!",
      };
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (err) {
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      throw new Error(`Falha de conexão em ${url}. Verifique se o servidor está ativo.`);
    }
    throw new Error(`Falha ao conectar no ERP: ${err.message}`);
  }
}
