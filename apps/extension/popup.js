/**
 * POPUP SCRIPT - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * Conexão automática (padrão AvantPRO / Mercado Turbo) com suporte a pareamento 1:N e Radar
 */

function normalizeErpUrl(rawUrl) {
  let url = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!url) return "http://localhost:3000";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  if (url.includes(".vercel.app") && url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }
  return url;
}

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
  const userLine = document.getElementById("userLine");
  const connectBanner = document.getElementById("connectBanner");
  const connectBtn = document.getElementById("connectBtn");
  const connectReason = document.getElementById("connectReason");
  const pageInfoBox = document.getElementById("pageInfoBox");
  const cardSectionTitle = document.getElementById("cardSectionTitle");
  const listingSelectContainer = document.getElementById("listingSelectContainer");
  const myListingSelect = document.getElementById("myListingSelect");
  const listingHint = document.getElementById("listingHint");

  let currentDetectedPlatform = null;
  let currentScrapedData = null;

  // 1. Detecta aba ativa
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url) {
    if (activeTab.url.includes("mercadolivre.com.br")) {
      currentDetectedPlatform = "mercadolivre";
    } else if (activeTab.url.includes("shopee.com.br")) {
      currentDetectedPlatform = "shopee";
    }
  }

  // 2. Consulta estado atual junto ao Service Worker
  chrome.runtime.sendMessage({ action: "GET_STATUS" }, async (statusRes) => {
    const config = statusRes || {};
    const erpUrl = normalizeErpUrl(config.erpUrl);
    if (erpUrlInput) erpUrlInput.value = erpUrl;
    if (apiTokenInput && config.hasToken) apiTokenInput.placeholder = "●●●●●●●●●● (Conectado via ERP)";

    updateConnectionUI(config.status, config.connectedUser, erpUrl);

    // 3. Se estiver em página de produto/busca do marketplace, extrai dados
    if (currentDetectedPlatform && activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_DATA" }, async (response) => {
        if (chrome.runtime.lastError || !response || (!response.data && !response.isSearch)) {
          pageInfoBox.innerHTML = `
            <strong>Marketplace Detectado:</strong> ${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"}<br>
            <span style="color:#64748B;">Abra uma busca ou a página de um anúncio para capturar concorrentes.</span>
          `;
          return;
        }

        // Se for página de busca/pesquisa
        if (response.isSearch) {
          if (cardSectionTitle) cardSectionTitle.innerText = "Pesquisa de Mercado (Aba Ativa)";
          if (captureNowBtn) captureNowBtn.style.display = "none";
          if (syncSearchBtn) syncSearchBtn.style.display = "block";

          pageInfoBox.innerHTML = `
            <div class="detected-prod">
              <strong>${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"} — Pesquisa</strong>
              <span>Termo: <strong style="color:#1e293b;">&quot;${response.query || "Busca"}&quot;</strong></span>
              <span>Anúncios Detectados: <strong style="color:#4F46E5;">${response.itemsCount} anúncios</strong></span>
              <span style="color:#64748B; font-size:10px; margin-top:2px;">Selecione seu anúncio abaixo para pareamento 1:N no Radar, ou mantenha como Radar de Mercado.</span>
            </div>
          `;

          await loadMyListings(currentDetectedPlatform);
          window.__CURRENT_SEARCH_COUNT__ = response.itemsCount;
          updateButtonLabel();
          return;
        }

        // Caso seja a página de um anúncio individual
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

        await loadMyListings(currentDetectedPlatform);
        captureNowBtn.style.display = "block";
      });
    } else {
      pageInfoBox.innerHTML = `
        <span style="color:#64748B;">Abra um anúncio no <strong>Mercado Livre</strong> ou <strong>Shopee</strong> para capturar concorrentes.</span>
      `;
    }
  });

  // Atualiza estado visual de conexão
  function updateConnectionUI(status, user, erpUrl) {
    const isOnline = !!status?.online;
    if (isOnline) {
      statusBadge.className = "status-badge online";
      statusText.innerText = "Conectado";
      if (userLine) {
        userLine.innerText = `Logado: ${user?.email || status?.user?.email || "Usuário ERP"} (${erpUrl})`;
      }
      if (connectBanner) connectBanner.style.display = "none";
    } else {
      statusBadge.className = "status-badge offline";
      statusText.innerText = "Desconectado";
      if (userLine) userLine.innerText = `Alvo: ${erpUrl}`;
      if (connectBanner) {
        connectBanner.style.display = "block";
        if (connectReason) {
          connectReason.innerText = status?.error || "Abra o ERP logado no Chrome para conectar automaticamente.";
        }
      }
    }
  }

  // 1-Click Conexão Automática: abre o ERP na tela de login/inteligência
  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      const targetUrl = normalizeErpUrl(erpUrlInput?.value);
      chrome.tabs.create({ url: `${targetUrl}/inteligencia` });
      window.close();
    });
  }

  // Salvar configurações manuais (se o usuário desejar personalizar)
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const erpUrl = normalizeErpUrl(erpUrlInput.value);
      const apiToken = apiTokenInput.value.trim();
      erpUrlInput.value = erpUrl;

      chrome.storage.local.set({ erpUrl, ...(apiToken ? { apiToken } : {}) }, () => {
        showFeedback(`Configurações salvas: ${erpUrl}`, "success");
        chrome.runtime.sendMessage({ action: "TEST_CONNECTION", erpUrl, apiToken }, (res) => {
          updateConnectionUI(res?.status, null, erpUrl);
          if (currentDetectedPlatform) loadMyListings(currentDetectedPlatform);
        });
      });
    });
  }

  const btnSetLocalhost = document.getElementById("btnSetLocalhost");
  const btnSetVercel = document.getElementById("btnSetVercel");
  if (btnSetLocalhost) {
    btnSetLocalhost.addEventListener("click", () => {
      erpUrlInput.value = "http://localhost:3000";
      saveBtn?.click();
    });
  }
  if (btnSetVercel) {
    btnSetVercel.addEventListener("click", () => {
      erpUrlInput.value = "https://23092026-new-erp-marketplaces-web.vercel.app";
      saveBtn?.click();
    });
  }

  // Testar Conexão
  if (testBtn) {
    testBtn.addEventListener("click", () => {
      const erpUrl = normalizeErpUrl(erpUrlInput.value);
      const apiToken = apiTokenInput.value.trim();

      testBtn.disabled = true;
      testBtn.innerText = "Testando...";

      chrome.runtime.sendMessage({ action: "TEST_CONNECTION", erpUrl, apiToken }, (res) => {
        testBtn.disabled = false;
        testBtn.innerText = "Testar Conexão";

        if (res && res.success) {
          updateConnectionUI(res.status, res.status?.user, erpUrl);
          showFeedback(res.message, "success");
        } else {
          updateConnectionUI(res?.status, null, erpUrl);
          showFeedback(res?.error || "Falha na conexão com o ERP.", "error");
        }
      });
    });
  }

  function updateButtonLabel() {
    const isSearchMode = !!window.__CURRENT_SEARCH_COUNT__;
    if (isSearchMode && syncSearchBtn) {
      const count = window.__CURRENT_SEARCH_COUNT__;
      if (myListingSelect.value) {
        syncSearchBtn.innerText = `🔗 Sincronizar e Vincular ao Meu Anúncio (${count} anúncios)`;
        syncSearchBtn.style.backgroundColor = "#059669";
      } else {
        syncSearchBtn.innerText = `🚀 Sincronizar com Pesquisa de Mercado (${count} anúncios)`;
        syncSearchBtn.style.backgroundColor = "#4F46E5";
      }
    }

    if (myListingSelect.value) {
      captureNowBtn.innerText = "🔗 Capturar e Vincular ao Meu Anúncio";
    } else {
      captureNowBtn.innerText = "📡 Enviar para Radar de Mercado (ERP)";
    }
  }

  // Disparo de captura a partir do popup
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
              ? "✅ Vinculado ao seu anúncio com sucesso no ERP! Abra o Radar para ver."
              : "✅ Concorrente enviado ao Radar de Mercado do ERP!",
            "success"
          );
        } else {
          showFeedback(res?.error || "Não foi possível acionar a captura na página.", "error");
        }
      }
    );
  });

  // Sincronização em massa de páginas de busca
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

        const selectedMyListingId = myListingSelect.value || null;
        const payload = {
          query: res.query,
          platform: res.platform,
          items: res.items,
          my_listing_id: selectedMyListingId,
        };

        chrome.runtime.sendMessage(
          { action: "SYNC_SEARCH_ITEMS", payload },
          (syncRes) => {
            syncSearchBtn.disabled = false;
            if (syncRes && syncRes.success) {
              const msg = selectedMyListingId
                ? `✅ ${res.items.length} concorrentes vinculados ao seu anúncio no Radar!`
                : `✅ ${res.items.length} anúncios sincronizados na Pesquisa de Mercado!`;
              showFeedback(msg, "success");
              syncSearchBtn.style.backgroundColor = "#10B981";
              syncSearchBtn.innerText = "✓ Sincronizado com Sucesso!";

              setTimeout(() => {
                const targetUrl = syncRes.redirectUrl?.startsWith("http")
                  ? syncRes.redirectUrl
                  : `${syncRes.erpUrl}${syncRes.redirectUrl}`;
                chrome.tabs.create({ url: targetUrl });
              }, 600);
            } else {
              syncSearchBtn.innerText = "Tentar Novamente";
              showFeedback(`Erro ao enviar ao ERP: ${syncRes?.error || "Verifique conexão"}`, "error");
            }
          }
        );
      });
    });
  }

  // Abrir Radar no ERP
  if (openErpBtn) {
    openErpBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "GET_STATUS" }, (status) => {
        const erpUrl = normalizeErpUrl(status?.erpUrl || erpUrlInput?.value);
        chrome.tabs.create({ url: `${erpUrl}/inteligencia` });
      });
    });
  }

  // Salva no storage a seleção do anúncio para sincronia
  myListingSelect.addEventListener("change", () => {
    chrome.storage.local.set({ selectedMyListingId: myListingSelect.value });
    updateButtonLabel();
  });

  // Carrega anúncios próprios do usuário autenticado no ERP
  async function loadMyListings(platform) {
    listingSelectContainer.style.display = "block";

    chrome.runtime.sendMessage({ action: "GET_MY_LISTINGS", platform }, (res) => {
      const items = res?.items || [];
      if (items.length > 0) {
        let optionsHtml = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
        optionsHtml += `<optgroup label="Vincular a um Anúncio Próprio:">`;
        items.forEach((item) => {
          optionsHtml += `<option value="${item.id}">[${item.product_sku || "Sem SKU"}] ${item.title.slice(0, 32)}... (R$ ${Number(item.current_price).toFixed(2)})</option>`;
        });
        optionsHtml += `</optgroup>`;
        myListingSelect.innerHTML = optionsHtml;

        if (listingHint) {
          listingHint.innerHTML = "Dica: Escolha seu anúncio para comparar Buybox ou mantenha em 'Radar' para apenas espionar preços.";
        }

        chrome.storage.local.get(["selectedMyListingId"], (store) => {
          if (store.selectedMyListingId) {
            myListingSelect.value = store.selectedMyListingId;
          }
        });
        updateButtonLabel();
      } else {
        myListingSelect.innerHTML = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
        if (listingHint) {
          listingHint.innerHTML = "💡 Concorrentes serão monitorados diretamente no <strong>Radar de Mercado</strong> do ERP.";
        }
        updateButtonLabel();
      }
    });
  }

  function showFeedback(text, type) {
    feedbackMsg.className = `feedback-msg ${type}`;
    feedbackMsg.innerText = text;
    feedbackMsg.style.display = "block";
    setTimeout(() => {
      feedbackMsg.style.display = "none";
    }, 6000);
  }
});
