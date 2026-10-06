/**
 * POPUP SCRIPT - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * Gerencia credenciais, teste de conectividade e pareamento assistido com anúncio próprio
 */

document.addEventListener("DOMContentLoaded", async () => {
  const erpUrlInput = document.getElementById("erpUrl");
  const apiTokenInput = document.getElementById("apiToken");
  const saveBtn = document.getElementById("saveBtn");
  const testBtn = document.getElementById("testBtn");
  const captureNowBtn = document.getElementById("captureNowBtn");
  const feedbackMsg = document.getElementById("feedbackMsg");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const pageInfoBox = document.getElementById("pageInfoBox");
  const listingSelectContainer = document.getElementById("listingSelectContainer");
  const myListingSelect = document.getElementById("myListingSelect");

  let currentDetectedPlatform = null;
  let currentScrapedData = null;

  // 1. Carrega configurações salvas
  chrome.storage.sync.get(["erpUrl", "apiToken", "selectedMyListingId"], (res) => {
    erpUrlInput.value = res.erpUrl || "http://localhost:3000";
    apiTokenInput.value = res.apiToken || "";

    checkConnectionStatus(erpUrlInput.value, res.apiToken || "");
  });

  // 2. Detecta aba ativa
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url) {
    if (activeTab.url.includes("mercadolivre.com.br")) {
      currentDetectedPlatform = "mercadolivre";
    } else if (activeTab.url.includes("shopee.com.br")) {
      currentDetectedPlatform = "shopee";
    }
  }

  // 3. Se estiver em página suportada, solicita dados extraídos do content script
  if (currentDetectedPlatform && activeTab?.id) {
    chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_DATA" }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.data) {
        pageInfoBox.innerHTML = `
          <strong>Marketplace Detectado:</strong> ${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"}<br>
          <span style="color:#64748B;">Abra a página de um anúncio específico para capturar concorrentes.</span>
        `;
        return;
      }

      currentScrapedData = response.data;
      const formattedPrice = currentScrapedData.current_price
        ? `R$ ${currentScrapedData.current_price.toFixed(2)}`
        : "Preço não detectado";

      pageInfoBox.innerHTML = `
        <div class="detected-prod">
          <strong>${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"}</strong>
          <span>Título: <em style="color:#1e293b;">${(currentScrapedData.title || "").slice(0, 45)}...</em></span>
          <span>ID: <code>${currentScrapedData.external_id}</code></span>
          <span>Preço: <strong style="color:#0f766e;">${formattedPrice}</strong></span>
          <span>Vendedor: <strong>${currentScrapedData.seller_name || "Desconhecido"}</strong></span>
        </div>
      `;

      // Carrega anúncios próprios para preencher o select
      const token = apiTokenInput.value;
      const url = erpUrlInput.value || "http://localhost:3000";
      await loadMyListings(url, token, currentDetectedPlatform);

      captureNowBtn.style.display = "block";
    });
  } else {
    pageInfoBox.innerHTML = `
      <span style="color:#64748B;">Abra um anúncio no <strong>Mercado Livre</strong> ou <strong>Shopee</strong> para capturar concorrentes.</span>
    `;
  }

  // 4. Salvar configurações
  saveBtn.addEventListener("click", () => {
    const erpUrl = erpUrlInput.value.trim().replace(/\/$/, "") || "http://localhost:3000";
    const apiToken = apiTokenInput.value.trim();

    chrome.storage.sync.set({ erpUrl, apiToken }, () => {
      showFeedback("Configurações salvas com sucesso!", "success");
      checkConnectionStatus(erpUrl, apiToken);
      if (currentDetectedPlatform) {
        loadMyListings(erpUrl, apiToken, currentDetectedPlatform);
      }
    });
  });

  // 5. Testar Conexão
  testBtn.addEventListener("click", () => {
    const erpUrl = erpUrlInput.value.trim().replace(/\/$/, "") || "http://localhost:3000";
    const apiToken = apiTokenInput.value.trim();

    testBtn.disabled = true;
    testBtn.innerText = "Testando...";

    chrome.runtime.sendMessage({ action: "TEST_CONNECTION", erpUrl, apiToken }, (res) => {
      testBtn.disabled = false;
      testBtn.innerText = "Testar Conexão";

      if (res && res.success) {
        setOnlineStatus(true);
        showFeedback(res.message, "success");
      } else {
        setOnlineStatus(false);
        showFeedback(res?.error || "Falha na conexão com o ERP.", "error");
      }
    });
  });

  // 6. Botão "Capturar e Vincular no ERP"
  captureNowBtn.addEventListener("click", () => {
    if (!activeTab || !activeTab.id) return;
    const selectedListingId = myListingSelect.value || null;

    captureNowBtn.disabled = true;
    captureNowBtn.innerText = "Enviando ao ERP...";

    chrome.tabs.sendMessage(
      activeTab.id,
      {
        action: "TRIGGER_CAPTURE_FROM_POPUP",
        my_listing_id: selectedListingId,
      },
      (res) => {
        captureNowBtn.disabled = false;
        captureNowBtn.innerText = "Capturar e Vincular no ERP";

        if (res && res.success) {
          showFeedback("Captura disparada! Veja a notificação na página.", "success");
        } else {
          showFeedback("Não foi possível acionar a captura na página.", "error");
        }
      }
    );
  });

  // Salva no storage a seleção do anúncio para sincronia
  myListingSelect.addEventListener("change", () => {
    chrome.storage.sync.set({ selectedMyListingId: myListingSelect.value });
  });

  // Funções Utilitárias
  function showFeedback(text, type) {
    feedbackMsg.className = `feedback-msg ${type}`;
    feedbackMsg.innerText = text;
    feedbackMsg.style.display = "block";
    setTimeout(() => {
      feedbackMsg.style.display = "none";
    }, 4500);
  }

  function setOnlineStatus(isOnline) {
    if (isOnline) {
      statusBadge.className = "status-badge online";
      statusText.innerText = "Conectado";
    } else {
      statusBadge.className = "status-badge offline";
      statusText.innerText = "Offline";
    }
  }

  async function checkConnectionStatus(erpUrl, apiToken) {
    chrome.runtime.sendMessage({ action: "TEST_CONNECTION", erpUrl, apiToken }, (res) => {
      setOnlineStatus(res && res.success);
    });
  }

  async function loadMyListings(erpUrl, apiToken, platform) {
    try {
      const headers = {};
      if (apiToken) {
        headers["Authorization"] = `Bearer ${apiToken}`;
      }

      const res = await fetch(`${erpUrl}/api/my-listings?platform=${platform}`, {
        headers,
      });

      if (!res.ok) return;

      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        myListingSelect.innerHTML = `<option value="">-- Não vincular agora (ou selecione abaixo) --</option>`;
        data.items.forEach((item) => {
          const opt = document.createElement("option");
          opt.value = item.id;
          opt.innerText = `[${item.product_sku || "Sem SKU"}] ${item.title.slice(0, 30)}... (R$ ${Number(item.current_price).toFixed(2)})`;
          myListingSelect.appendChild(opt);
        });

        // Restaura seleção anterior se existir
        chrome.storage.sync.get(["selectedMyListingId"], (store) => {
          if (store.selectedMyListingId) {
            myListingSelect.value = store.selectedMyListingId;
          }
        });

        listingSelectContainer.style.display = "block";
      }
    } catch (e) {
      console.warn("Falha ao carregar anúncios próprios:", e);
    }
  }
});
