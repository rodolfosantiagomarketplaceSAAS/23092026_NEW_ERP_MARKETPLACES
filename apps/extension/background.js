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
  const apiToken = config.apiToken;

  if (!apiToken) {
    throw new Error("Token de Acesso não configurado. Abra o popup da extensão e configure seu Bearer Token.");
  }

  const endpoint = `${erpUrl}/api/competitors/sync`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}: ${response.statusText}`);
    }

    return { success: true, data };
  } catch (error) {
    console.error("[ERP Background Worker] Erro no fetch de sync:", error);
    throw error;
  }
}

/**
 * Valida a conexão com o ERP
 */
async function handleTestConnection(erpUrl, apiToken) {
  const url = (erpUrl || "http://localhost:3000").replace(/\/$/, "");
  if (!apiToken) {
    throw new Error("Informe o token de autenticação.");
  }

  try {
    const response = await fetch(`${url}/api/my-listings?platform=mercadolivre&limit=1`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
      },
    });

    if (response.ok) {
      return { success: true, message: "Conexão com o ERP estabelecida com sucesso!" };
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro de autenticação HTTP ${response.status}`);
    }
  } catch (err) {
    throw new Error(`Falha ao conectar no ERP: ${err.message}`);
  }
}
