/**
 * POPUP SCRIPT - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * Gerencia credenciais, teste de conectividade e pareamento assistido com anúncio próprio
 */

/**
 * Normaliza e sanitiza a URL do ERP
 */
function normalizeErpUrl(rawUrl) {
  let url = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!url) return "http://localhost:3000";

  // Se o usuário digitou sem protocolo (ex: crm-marketplaces.vercel.app)
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Se for endereço da Vercel, força HTTPS
  if (url.includes(".vercel.app") && url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }

  return url;
}

/**
 * Helper de armazenamento confiável (combina local com sync)
 */
const extensionStorage = {
  get: (keys, callback) => {
    chrome.storage.local.get(keys, (localData) => {
      chrome.storage.sync.get(keys, (syncData) => {
        const merged = { ...(syncData || {}), ...(localData || {}) };
        callback(merged);
      });
    });
  },
  set: (data, callback) => {
    chrome.storage.local.set(data, () => {
      try {
        chrome.storage.sync.set(data, () => {
          if (callback) callback();
        });
      } catch {
        if (callback) callback();
      }
    });
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  const erpUrlInput = document.getElementById("erpUrl");
  const apiTokenInput = document.getElementById("apiToken");
  const saveBtn = document.getElementById("saveBtn");
  const testBtn = document.getElementById("testBtn");
  const captureNowBtn = document.getElementById("captureNowBtn");
  const syncSearchBtn = document.getElementById("syncSearchBtn");
  const openErpBtn = document.getElementById("openErpBtn");
  const feedbackMsg = document.getElementById("feedbackMsg");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const pageInfoBox = document.getElementById("pageInfoBox");
  const cardSectionTitle = document.getElementById("cardSectionTitle");
  const listingSelectContainer = document.getElementById("listingSelectContainer");
  const myListingSelect = document.getElementById("myListingSelect");
  const listingHint = document.getElementById("listingHint");

  let currentDetectedPlatform = null;
  let currentScrapedData = null;

  // 1. Detecta aba ativa primeiro
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url) {
    if (activeTab.url.includes("mercadolivre.com.br")) {
      currentDetectedPlatform = "mercadolivre";
    } else if (activeTab.url.includes("shopee.com.br")) {
      currentDetectedPlatform = "shopee";
    }
  }

  // 2. Carrega configurações salvas (Local + Sync)
  extensionStorage.get(["erpUrl", "apiToken", "selectedMyListingId"], (res) => {
    const savedUrl = normalizeErpUrl(res.erpUrl);
    erpUrlInput.value = savedUrl;
    apiTokenInput.value = res.apiToken || "";

    checkConnectionStatus(savedUrl, res.apiToken || "");

    // 3. Se estiver em página suportada, extrai dados da página e busca anúncios próprios
    if (currentDetectedPlatform && activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_DATA" }, async (response) => {
        if (chrome.runtime.lastError || !response || (!response.data && !response.isSearch)) {
          pageInfoBox.innerHTML = `
            <strong>Marketplace Detectado:</strong> ${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"}<br>
            <span style="color:#64748B;">Abra uma busca ou a página de um anúncio para capturar concorrentes.</span>
          `;
          return;
        }

        // Se estiver em página de pesquisa de produtos (Mercado Livre ou Shopee)
        if (response.isSearch) {
          if (cardSectionTitle) cardSectionTitle.innerText = "Pesquisa de Mercado (Aba Ativa)";
          if (listingSelectContainer) listingSelectContainer.style.display = "none";
          if (captureNowBtn) captureNowBtn.style.display = "none";
          if (syncSearchBtn) {
            syncSearchBtn.style.display = "block";
            syncSearchBtn.innerText = `🚀 Sincronizar Pesquisa com ERP (${response.itemsCount} anúncios)`;
          }

          pageInfoBox.innerHTML = `
            <div class="detected-prod">
              <strong>${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"} — Pesquisa</strong>
              <span>Termo: <strong style="color:#1e293b;">&quot;${response.query || "Busca"}&quot;</strong></span>
              <span>Anúncios Detectados: <strong style="color:#4F46E5;">${response.itemsCount} anúncios</strong></span>
              <span style="color:#64748B; font-size:10px; margin-top:2px;">Clique abaixo para enviar ao ERP e ver gráficos de preços, Buybox e concorrentes.</span>
            </div>
          `;
          return;
        }

        // Caso seja a página de um produto individual
        if (cardSectionTitle) cardSectionTitle.innerText = "Anúncio Atual (Aba Ativa)";
        if (syncSearchBtn) syncSearchBtn.style.display = "none";

        currentScrapedData = response.data;
        const formattedPrice = currentScrapedData.current_price
          ? `R$ ${currentScrapedData.current_price.toFixed(2)}`
          : "Preço não detectado";
        const formattedSales =
          currentScrapedData.sales_count_approx !== undefined && currentScrapedData.sales_count_approx > 0
            ? `${currentScrapedData.sales_count_approx.toLocaleString("pt-BR")} vendas`
            : "0 vendas";
        const formattedDate = currentScrapedData.listing_created_at
          ? new Date(currentScrapedData.listing_created_at).toLocaleDateString("pt-BR")
          : "Não detectada";

        pageInfoBox.innerHTML = `
          <div class="detected-prod">
            <strong>${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"}</strong>
            <span>Título: <em style="color:#1e293b;">${(currentScrapedData.title || "").slice(0, 45)}...</em></span>
            <span>ID: <code>${currentScrapedData.external_id}</code></span>
            <span>Preço: <strong style="color:#0f766e;">${formattedPrice}</strong></span>
            <span>Vendedor: <strong>${currentScrapedData.seller_name || "Desconhecido"}</strong></span>
            <span>Vendas: <strong style="color:#059669;">${formattedSales}</strong></span>
            <span>Criado em: <strong style="color:#475569;">${formattedDate}</strong></span>
          </div>
        `;

        // Carrega anúncios próprios do ERP usando as credenciais já carregadas
        await loadMyListings(savedUrl, res.apiToken || "", currentDetectedPlatform, res.selectedMyListingId);
        captureNowBtn.style.display = "block";
      });
    } else {
      pageInfoBox.innerHTML = `
        <span style="color:#64748B;">Abra um anúncio no <strong>Mercado Livre</strong> ou <strong>Shopee</strong> para capturar concorrentes.</span>
      `;
    }
  });

  // 4. Salvar configurações
  saveBtn.addEventListener("click", () => {
    const rawUrl = erpUrlInput.value;
    const erpUrl = normalizeErpUrl(rawUrl);
    const apiToken = apiTokenInput.value.trim();

    // Atualiza campo visualmente com a URL normalizada
    erpUrlInput.value = erpUrl;

    extensionStorage.set({ erpUrl, apiToken }, () => {
      showFeedback(`Configurações salvas: ${erpUrl}`, "success");
      checkConnectionStatus(erpUrl, apiToken);
      if (currentDetectedPlatform) {
        loadMyListings(erpUrl, apiToken, currentDetectedPlatform);
      }
    });
  });

  // 5. Testar Conexão
  testBtn.addEventListener("click", () => {
    const erpUrl = normalizeErpUrl(erpUrlInput.value);
    const apiToken = apiTokenInput.value.trim();

    erpUrlInput.value = erpUrl;
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

  function updateButtonLabel() {
    if (myListingSelect.value) {
      captureNowBtn.innerText = "🔗 Capturar e Vincular ao Meu Anúncio";
    } else {
      captureNowBtn.innerText = "📡 Enviar para Radar de Mercado (ERP)";
    }
  }

  // 6. Botão "Sincronizar Pesquisa com ERP" (Quando em páginas de busca)
  if (syncSearchBtn) {
    syncSearchBtn.addEventListener("click", () => {
      if (!activeTab || !activeTab.id) return;
      syncSearchBtn.disabled = true;
      syncSearchBtn.innerText = "Extraindo e enviando ao ERP...";

      chrome.tabs.sendMessage(activeTab.id, { action: "SYNC_SEARCH_FROM_POPUP" }, async (res) => {
        if (chrome.runtime.lastError || !res || !res.items) {
          syncSearchBtn.disabled = false;
          syncSearchBtn.innerText = "Tentar Novamente";
          showFeedback("Não foi possível extrair os anúncios da página de busca.", "error");
          return;
        }

        const erpUrl = normalizeErpUrl(erpUrlInput.value);
        const apiToken = apiTokenInput.value.trim();

        try {
          const payload = {
            query: res.query,
            platform: res.platform,
            items: res.items,
          };

          const headers = { "Content-Type": "application/json" };
          if (apiToken) headers["Authorization"] = `Bearer ${apiToken}`;

          const syncRes = await fetch(`${erpUrl}/api/bi/market-search/bulk-sync`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });

          if (syncRes.ok) {
            showFeedback(`✅ ${res.items.length} anúncios sincronizados com o ERP!`, "success");
            syncSearchBtn.style.backgroundColor = "#10B981";
            syncSearchBtn.innerText = "✓ Sincronizado com Sucesso!";

            setTimeout(() => {
              chrome.tabs.create({
                url: `${erpUrl}/inteligencia?q=${encodeURIComponent(res.query)}&platform=${res.platform}`,
              });
            }, 600);
          } else {
            throw new Error(`HTTP ${syncRes.status}`);
          }
        } catch (err) {
          console.error(err);
          syncSearchBtn.disabled = false;
          syncSearchBtn.innerText = "Tentar Novamente";
          showFeedback(`Erro ao enviar ao ERP (${erpUrl}). Verifique se o ERP está online.`, "error");
        }
      });
    });
  }

  // 6.1 Botão "Capturar / Enviar Concorrente"
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
        updateButtonLabel();

        if (res && res.success) {
          showFeedback(
            selectedListingId
              ? "✅ Vinculado ao seu anúncio com sucesso no ERP!"
              : "✅ Concorrente enviado ao Radar de Mercado do ERP! Clique em 'Abrir Radar no ERP' para ver.",
            "success"
          );
        } else {
          showFeedback(res?.error || "Não foi possível acionar a captura na página.", "error");
        }
      }
    );
  });

  // 7. Botão "Abrir Radar no ERP"
  if (openErpBtn) {
    openErpBtn.addEventListener("click", () => {
      const erpUrl = normalizeErpUrl(erpUrlInput.value);
      chrome.tabs.create({ url: `${erpUrl}/inteligencia` });
    });
  }

  // Salva no storage a seleção do anúncio para sincronia
  myListingSelect.addEventListener("change", () => {
    extensionStorage.set({ selectedMyListingId: myListingSelect.value });
    updateButtonLabel();
  });

  // Funções Utilitárias
  function showFeedback(text, type) {
    feedbackMsg.className = `feedback-msg ${type}`;
    feedbackMsg.innerText = text;
    feedbackMsg.style.display = "block";
    setTimeout(() => {
      feedbackMsg.style.display = "none";
    }, 6000);
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

  async function loadMyListings(erpUrl, apiToken, platform, preselectedId = null) {
    listingSelectContainer.style.display = "block";
    const normalized = normalizeErpUrl(erpUrl);

    try {
      const headers = {};
      if (apiToken) {
        headers["Authorization"] = `Bearer ${apiToken}`;
      }

      const res = await fetch(`${normalized}/api/my-listings?platform=${platform}`, {
        headers,
      });

      if (!res.ok) {
        myListingSelect.innerHTML = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
        if (listingHint) {
          listingHint.innerHTML = "💡 Concorrente será monitorado no <strong>Radar de Mercado</strong> do ERP.";
        }
        updateButtonLabel();
        return;
      }

      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        let optionsHtml = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
        optionsHtml += `<optgroup label="Vincular a um Anúncio Próprio:">`;
        data.items.forEach((item) => {
          optionsHtml += `<option value="${item.id}">[${item.product_sku || "Sem SKU"}] ${item.title.slice(0, 32)}... (R$ ${Number(item.current_price).toFixed(2)})</option>`;
        });
        optionsHtml += `</optgroup>`;
        myListingSelect.innerHTML = optionsHtml;

        if (listingHint) {
          listingHint.innerHTML = "Dica: Escolha seu anúncio para comparar Buybox ou mantenha em 'Radar' para apenas espionar preços.";
        }

        // Restaura seleção anterior se existir
        if (preselectedId) {
          myListingSelect.value = preselectedId;
        } else {
          extensionStorage.get(["selectedMyListingId"], (store) => {
            if (store.selectedMyListingId) {
              myListingSelect.value = store.selectedMyListingId;
            }
          });
        }
        updateButtonLabel();
      } else {
        // Usuário sem anúncios próprios
        myListingSelect.innerHTML = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
        if (listingHint) {
          listingHint.innerHTML = "💡 <em>Você ainda não tem anúncios cadastrados.</em> O concorrente será monitorado diretamente no <strong>Radar de Mercado</strong> do ERP.";
        }
        updateButtonLabel();
      }
    } catch (e) {
      console.warn("Falha ao carregar anúncios próprios:", e);
      myListingSelect.innerHTML = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
      if (listingHint) {
        listingHint.innerHTML = "💡 Concorrente será monitorado no <strong>Radar de Mercado</strong> do ERP.";
      }
      updateButtonLabel();
    }
  }
});
