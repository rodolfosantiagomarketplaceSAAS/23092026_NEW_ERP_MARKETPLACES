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
  const listingCountBadge = document.getElementById("listingCountBadge");
  const platformChips = document.getElementById("platformChips");
  const selectedListingCard = document.getElementById("selectedListingCard");
  const selectedSkuTag = document.getElementById("selectedSkuTag");
  const selectedPriceTag = document.getElementById("selectedPriceTag");
  const selectedTitleText = document.getElementById("selectedTitleText");
  const btnToggleDropdown = document.getElementById("btnToggleDropdown");
  const btnResetToRadar = document.getElementById("btnResetToRadar");
  const searchBoxWrapper = document.getElementById("searchBoxWrapper");
  const listingSearchInput = document.getElementById("listingSearchInput");
  const listingSearchClear = document.getElementById("listingSearchClear");
  const listingDropdownList = document.getElementById("listingDropdownList");
  const showFloatingBtnCheckbox = document.getElementById("showFloatingBtnCheckbox");
  const downloadPhotosBtn = document.getElementById("downloadPhotosBtn");
  const downloadPhotosProgress = document.getElementById("downloadPhotosProgress");
  const downloadPhotosProgressText = document.getElementById("downloadPhotosProgressText");
  const photosActionContainer = document.getElementById("photosActionContainer");
  const photosTotalCount = document.getElementById("photosTotalCount");
  const toggleGalleryBtn = document.getElementById("toggleGalleryBtn");
  const photosGalleryContainer = document.getElementById("photosGalleryContainer");
  const photosGrid = document.getElementById("photosGrid");
  const selectAllPhotosBtn = document.getElementById("selectAllPhotosBtn");
  const deselectAllPhotosBtn = document.getElementById("deselectAllPhotosBtn");
  const downloadSelectedPhotosBtn = document.getElementById("downloadSelectedPhotosBtn");
  const selectedPhotosCount = document.getElementById("selectedPhotosCount");
  const galleryHeaderCount = document.getElementById("galleryHeaderCount");

  let allMyListings = [];
  let activePlatformFilter = "all";
  let isDropdownOpen = false;

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
        if (chrome.runtime.lastError || !response || (!response.data && !response.isSearch && !response.isStore)) {
          pageInfoBox.innerHTML = `
            <strong>Marketplace Detectado:</strong> ${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"}<br>
            <span style="color:#64748B;">Abra uma busca ou a página de um anúncio para capturar concorrentes.</span>
          `;
          return;
        }

        // Se for página de Loja/Vendedor Concorrente
        if (response.isStore) {
          if (cardSectionTitle) cardSectionTitle.innerText = "Loja de Concorrente Detectada (Aba Ativa)";
          if (captureNowBtn) captureNowBtn.style.display = "none";
          if (downloadPhotosBtn) downloadPhotosBtn.style.display = "none";
          if (photosActionContainer) photosActionContainer.style.display = "none";
          if (photosGalleryContainer) photosGalleryContainer.style.display = "none";
          if (downloadPhotosProgress) downloadPhotosProgress.style.display = "none";
          if (syncSearchBtn) syncSearchBtn.style.display = "none";
          if (listingSelectContainer) listingSelectContainer.style.display = "none";

          const storeConfigBox = document.getElementById("storeConfigBox");
          const syncStoreBtn = document.getElementById("syncStoreBtn");
          if (storeConfigBox) storeConfigBox.style.display = "block";
          if (syncStoreBtn) {
            syncStoreBtn.style.display = "block";
            syncStoreBtn.innerText = `🏬 Capturar Loja (${response.itemsCount} anúncios) para o ERP`;
          }

          pageInfoBox.innerHTML = `
            <div class="detected-prod">
              <strong style="color: #4338CA;">🏬 Loja de Concorrente — Mercado Livre</strong>
              <span>Loja / Vendedor: <strong style="color:#1e293b; font-size: 13px;">${response.storeName || "Loja Oficial"}</strong></span>
              <span>Anúncios na Página: <strong style="color:#4F46E5;">${response.itemsCount} anúncios</strong></span>
              <span>Link da Loja: <a href="${response.storeUrl}" target="_blank" style="color:#2563EB; font-size:10px; word-break:break-all;">${response.storeUrl}</a></span>
              <span style="color:#475569; font-size:10px; margin-top:3px;">
                💡 Ao capturar, todos os produtos, vendas, datas de criação e preços serão salvos na aba <strong>Inteligência de Negócios &gt; Espião de Concorrentes</strong> no ERP!
              </span>
            </div>
          `;

          if (syncStoreBtn) {
            syncStoreBtn.onclick = async () => {
              const segInput = document.getElementById("storeSegmentInput");
              const followCheck = document.getElementById("storeFollowCheckbox");
              const segmentVal = (segInput?.value || "Acessórios Automotivos").trim();
              const isFollowingVal = followCheck ? followCheck.checked : true;

              syncStoreBtn.disabled = true;
              syncStoreBtn.innerText = "⏳ Extraindo anúncios e enviando ao ERP...";

              chrome.tabs.sendMessage(
                activeTab.id,
                {
                  action: "SYNC_STORE_FROM_POPUP",
                  segment: segmentVal,
                  is_following: isFollowingVal,
                },
                async (storeRes) => {
                  if (chrome.runtime.lastError || !storeRes || !storeRes.success) {
                    showFeedback("Erro ao capturar anúncios da loja.", true);
                    syncStoreBtn.disabled = false;
                    syncStoreBtn.innerText = `🏬 Capturar Loja (${response.itemsCount} anúncios) para o ERP`;
                    return;
                  }

                  const currentErpUrl = normalizeErpUrl(erpUrlInput?.value);
                  const payload = {
                    platform: "mercadolivre",
                    store_name: response.storeName,
                    seller_id: response.sellerId || null,
                    seller_nickname: response.sellerNickname || response.storeName,
                    store_url: response.storeUrl,
                    segment: segmentVal,
                    is_following: isFollowingVal,
                    items: storeRes.items || [],
                  };

                  chrome.runtime.sendMessage(
                    {
                      action: "SYNC_STORE_ITEMS",
                      erpUrl: currentErpUrl,
                      payload,
                    },
                    (syncRes) => {
                      if (chrome.runtime.lastError || !syncRes || !syncRes.success) {
                        const errMsg = syncRes?.error || chrome.runtime.lastError?.message || "Falha ao enviar ao ERP.";
                        showFeedback(errMsg, true);
                        syncStoreBtn.disabled = false;
                        syncStoreBtn.innerText = `🏬 Capturar Loja (${response.itemsCount} anúncios) para o ERP`;
                        return;
                      }

                      showFeedback(`✅ Loja sincronizada com ${syncRes.count || syncRes.listings_count || payload.items.length} anúncios no ERP!`, false);
                      syncStoreBtn.innerText = "✅ Sincronizado com Sucesso!";
                      setTimeout(() => {
                        window.open(`${currentErpUrl}/inteligencia?tab=lojas`, "_blank");
                      }, 1000);
                    }
                  );
                }
              );
            };
          }
          return;
        }

        // Se for página de busca/pesquisa
        if (response.isSearch) {
          if (cardSectionTitle) cardSectionTitle.innerText = "Pesquisa de Mercado (Aba Ativa)";
          if (captureNowBtn) captureNowBtn.style.display = "none";
          if (downloadPhotosBtn) downloadPhotosBtn.style.display = "none";
          if (photosActionContainer) photosActionContainer.style.display = "none";
          if (photosGalleryContainer) photosGalleryContainer.style.display = "none";
          if (downloadPhotosProgress) downloadPhotosProgress.style.display = "none";
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
          ? `R$ ${currentScrapedData.current_price.toFixed(2).replace(".", ",")}`
          : "Preço não detectado";
        const salesCount = Number(currentScrapedData.sales_count_approx || 0);
        const formattedSales =
          salesCount > 0
            ? `${salesCount.toLocaleString("pt-BR")} ${salesCount === 1 ? "venda" : "vendas"}`
            : "0 vendas (Sem vendas)";
        const salesColor = salesCount > 0 ? "#059669" : "#64748B";

        let formattedDate = "Não detectada";
        if (currentScrapedData.listing_created_at) {
          const createdObj = new Date(currentScrapedData.listing_created_at);
          if (!isNaN(createdObj.getTime())) {
            const brDate = createdObj.toLocaleDateString("pt-BR");
            const diffDays = Math.max(0, Math.floor((Date.now() - createdObj.getTime()) / 86400000));
            const ageText = diffDays === 0 ? "hoje" : diffDays === 1 ? "há 1 dia" : `há ${diffDays} dias`;
            formattedDate = `${brDate} (${ageText})`;
          }
        }

        const formatMoney = (v) =>
          typeof v === "number" && !isNaN(v) ? `R$ ${v.toFixed(2).replace(".", ",")}` : "—";

        const initialFeeText =
          currentScrapedData.sale_fee_amount !== undefined
            ? `${formatMoney(currentScrapedData.sale_fee_amount)} (${currentScrapedData.sale_fee_pct || 11.5}% • ${
                currentScrapedData.listing_type_label || "Clássico"
              })`
            : "Calculando...";
        const initialShippingText =
          currentScrapedData.shipping_cost !== undefined
            ? currentScrapedData.shipping_cost > 0
              ? formatMoney(currentScrapedData.shipping_cost)
              : "R$ 0,00 (Comprador / Programa)"
            : "Calculando...";
        const initialNetText =
          currentScrapedData.net_receivable !== undefined
            ? formatMoney(currentScrapedData.net_receivable)
            : "Calculando...";

        const pictures =
          Array.isArray(currentScrapedData.pictures) && currentScrapedData.pictures.length > 0
            ? currentScrapedData.pictures
            : [];
        const photosCountText =
          pictures.length > 0 ? `${pictures.length} fotos em alta resolução` : "1 foto detectada";

        pageInfoBox.innerHTML = `
          <div class="detected-prod">
            <strong>${currentDetectedPlatform === "mercadolivre" ? "Mercado Livre" : "Shopee"}</strong>
            <span>Título: <em style="color:#1e293b;">${(currentScrapedData.title || "").slice(0, 45)}...</em></span>
            <span>ID: <code>${currentScrapedData.external_id}</code></span>
            <span>Preço: <strong style="color:#0f766e;">${formattedPrice}</strong></span>
            <span>Vendedor: <strong>${currentScrapedData.seller_name || "Desconhecido"}</strong></span>
            <span>Vendas: <strong style="color:${salesColor};">${formattedSales}</strong></span>
            <span>Criado em: <strong style="color:#334155;">${formattedDate}</strong></span>
            <span>Fotos: <strong id="extPhotosCountVal" style="color:#0284C7;">${photosCountText}</strong></span>
            <div style="margin-top:4px; padding-top:4px; border-top:1px dashed #CBD5E1; display:flex; flex-direction:column; gap:2px;">
              <span>Tarifa: <strong id="extSaleFeeVal" style="color:#DC2626;">${initialFeeText}</strong></span>
              <span>Frete: <strong id="extShippingCostVal" style="color:#D97706;">${initialShippingText}</strong></span>
              <span>Líquido Concorrente: <strong id="extNetVal" style="color:#059669;">${initialNetText}</strong></span>
            </div>
          </div>
        `;

        // Refina Tarifa e Frete junto à API Oficial do Mercado Livre via ERP (apenas se não veio cravado do DOM)
        if (
          currentScrapedData.current_price > 0 &&
          (!currentScrapedData.fee_from_dom || !currentScrapedData.shipping_from_dom)
        ) {
          chrome.runtime.sendMessage(
            {
              action: "GET_COMPETITOR_FEES",
              platform: currentDetectedPlatform,
              item_id: currentScrapedData.resolved_item_id || currentScrapedData.external_id,
              price: currentScrapedData.current_price,
              listing_type: currentScrapedData.listing_type,
              category_id: currentScrapedData.category_id,
              breadcrumb: currentScrapedData.breadcrumb,
              title: currentScrapedData.title,
            },
            (feeRes) => {
              if (chrome.runtime.lastError || !feeRes || !feeRes.success) return;
              const feeEl = document.getElementById("extSaleFeeVal");
              const shipEl = document.getElementById("extShippingCostVal");
              const netEl = document.getElementById("extNetVal");

              let finalFee = currentScrapedData.sale_fee_amount || 0;
              let finalShipping = currentScrapedData.shipping_cost || 0;

              if (typeof feeRes.sale_fee_amount === "number" && !currentScrapedData.fee_from_dom) {
                finalFee = feeRes.sale_fee_amount;
                currentScrapedData.sale_fee_amount = finalFee;
                currentScrapedData.sale_fee_pct = feeRes.sale_fee_pct;
                if (feeEl) {
                  feeEl.innerText = `${formatMoney(finalFee)} (${feeRes.sale_fee_pct}% • ${
                    feeRes.listing_type_label || "Clássico"
                  })`;
                }
              }

              // Nunca sobrescreve o frete se ele já veio cravado do DOM da página
              const canUpdateShipping = !currentScrapedData.shipping_from_dom;
              if (typeof feeRes.shipping_cost === "number" && canUpdateShipping) {
                finalShipping = feeRes.shipping_cost;
                currentScrapedData.shipping_cost = finalShipping;
                if (shipEl) {
                  shipEl.innerText =
                    finalShipping > 0 ? formatMoney(finalShipping) : "R$ 0,00 (Comprador / Programa)";
                }
              }

              const finalNet = Number(
                Math.max(0, (currentScrapedData.current_price || 0) - finalFee - finalShipping).toFixed(2)
              );
              currentScrapedData.net_receivable = finalNet;
              if (netEl) {
                netEl.innerText = formatMoney(finalNet);
              }
            }
          );
        }

        await loadMyListings(currentDetectedPlatform);
        captureNowBtn.style.display = "block";
        if (photosActionContainer) photosActionContainer.style.display = "block";
        if (downloadPhotosBtn) {
          downloadPhotosBtn.style.display = "block";
          const count = pictures.length;
          if (photosTotalCount) photosTotalCount.innerText = count > 0 ? String(count) : "";
          downloadPhotosBtn.innerText =
            count > 0 ? `📸 Baixar Todas (${count})` : "📸 Baixar Fotos";
        }

        // Suporte a captura do concorrente direto na página de anúncio (PDP)
        const pdpStoreBox = document.getElementById("pdpStoreBox");
        const pdpSellerNameText = document.getElementById("pdpSellerNameText");
        const pdpSellerRepBadge = document.getElementById("pdpSellerRepBadge");
        const pdpCaptureStoreBtn = document.getElementById("pdpCaptureStoreBtn");
        const pdpOpenStoreUrlBtn = document.getElementById("pdpOpenStoreUrlBtn");

        if (pdpStoreBox && currentScrapedData.seller_name && currentDetectedPlatform === "mercadolivre") {
          pdpStoreBox.style.display = "block";
          if (pdpSellerNameText) pdpSellerNameText.innerText = currentScrapedData.seller_name;
          if (pdpSellerRepBadge) {
            pdpSellerRepBadge.innerText = (currentScrapedData.seller_reputation || "platinum").toUpperCase();
          }
          if (pdpOpenStoreUrlBtn) {
            const storeUrl = currentScrapedData.seller_store_url;
            if (storeUrl) {
              pdpOpenStoreUrlBtn.style.display = "block";
              pdpOpenStoreUrlBtn.onclick = () => {
                window.open(storeUrl, "_blank");
              };
            } else {
              pdpOpenStoreUrlBtn.style.display = "none";
            }
          }
          if (pdpCaptureStoreBtn) {
            pdpCaptureStoreBtn.onclick = () => {
              pdpCaptureStoreBtn.disabled = true;
              pdpCaptureStoreBtn.innerText = "⏳ Espionando e enviando ao ERP...";

              const currentErpUrl = normalizeErpUrl(erpUrlInput?.value);
              const storePayload = {
                platform: "mercadolivre",
                store_name: currentScrapedData.seller_name,
                seller_id: currentScrapedData.seller_id || null,
                seller_nickname: currentScrapedData.seller_name,
                store_url: currentScrapedData.seller_store_url || currentScrapedData.permalink || window.location.href,
                segment: "Acessórios Automotivos",
                is_following: true,
                seller_reputation: currentScrapedData.seller_reputation || "platinum",
                items: [
                  {
                    external_id: currentScrapedData.external_id,
                    title: currentScrapedData.title,
                    current_price: currentScrapedData.current_price,
                    original_price: currentScrapedData.original_price,
                    discount_pct: currentScrapedData.discount_pct || null,
                    sales_count_approx: currentScrapedData.sales_count_approx || 0,
                    listing_created_at: currentScrapedData.listing_created_at || null,
                    shipping_type: currentScrapedData.shipping_type || "padrao",
                    is_full: currentScrapedData.shipping_type === "ml_full",
                    is_free_shipping: currentScrapedData.shipping_cost === 0,
                    promo_badge: currentScrapedData.promo_badge,
                    permalink: currentScrapedData.permalink,
                    thumbnail_url: currentScrapedData.thumbnail_url,
                    rating: currentScrapedData.rating || 5.0,
                    reviews_count: 0,
                    estimated_sale_fee: currentScrapedData.sale_fee_amount || 0,
                    estimated_net: currentScrapedData.net_receivable || 0,
                  },
                ],
              };

              chrome.runtime.sendMessage(
                {
                  action: "SYNC_STORE_ITEMS",
                  erpUrl: currentErpUrl,
                  payload: storePayload,
                },
                (syncRes) => {
                  if (chrome.runtime.lastError || !syncRes || !syncRes.success) {
                    const err = syncRes?.error || chrome.runtime.lastError?.message || "Falha ao enviar concorrente.";
                    showFeedback(err, true);
                    pdpCaptureStoreBtn.disabled = false;
                    pdpCaptureStoreBtn.innerText = "🏬 Espionar Loja deste Concorrente no ERP";
                    return;
                  }

                  showFeedback(`✅ Concorrente "${currentScrapedData.seller_name}" adicionado ao Espião com sucesso!`, false);
                  pdpCaptureStoreBtn.innerText = "✅ Concorrente Adicionado ao ERP!";
                  setTimeout(() => {
                    window.open(`${currentErpUrl}/inteligencia?tab=lojas`, "_blank");
                  }, 1000);
                }
              );
            };
          }
        } else if (pdpStoreBox) {
          pdpStoreBox.style.display = "none";
        }
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

  // Controle da visibilidade do botão flutuante nos anúncios
  if (showFloatingBtnCheckbox) {
    chrome.storage.local.get(["showFloatingBtn"], (res) => {
      // Padrão: false (desativado para não cobrir o conteúdo do Mercado Livre)
      showFloatingBtnCheckbox.checked = res?.showFloatingBtn === true;
    });

    showFloatingBtnCheckbox.addEventListener("change", () => {
      const isEnabled = showFloatingBtnCheckbox.checked;
      chrome.storage.local.set({ showFloatingBtn: isEnabled }, () => {
        showFeedback(
          isEnabled
            ? "Botão flutuante ativado nas páginas de anúncios."
            : "Botão flutuante desativado. Não aparecerá mais nos anúncios.",
          "info"
        );
      });
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
        scraped_data: currentScrapedData || null,
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

  // ==============================================================================
  // GESTÃO E DOWNLOAD DE FOTOS DO ANÚNCIO (TODAS, INDIVIDUAIS OU SELECIONADAS)
  // ==============================================================================
  const selectedPhotoIndices = new Set();

  function updateSelectedCount() {
    const count = selectedPhotoIndices.size;
    if (selectedPhotosCount) selectedPhotosCount.innerText = String(count);
    if (downloadSelectedPhotosBtn) {
      downloadSelectedPhotosBtn.style.display = count > 0 ? "block" : "none";
    }
  }

  async function ensurePhotosLoaded() {
    let photos = currentScrapedData?.pictures || [];
    if (photos.length === 0 && activeTab?.id) {
      if (downloadPhotosProgress) downloadPhotosProgress.style.display = "block";
      if (downloadPhotosProgressText) downloadPhotosProgressText.innerText = "Localizando fotos na página...";
      try {
        const res = await new Promise((resolve) => {
          chrome.tabs.sendMessage(activeTab.id, { action: "GET_LISTING_IMAGES" }, (r) => {
            if (chrome.runtime.lastError || !r) return resolve(null);
            resolve(r);
          });
        });
        if (res?.pictures && Array.isArray(res.pictures) && res.pictures.length > 0) {
          photos = res.pictures;
          if (currentScrapedData) currentScrapedData.pictures = photos;
        }
      } catch {}
      if (downloadPhotosProgress) downloadPhotosProgress.style.display = "none";
    }
    return photos;
  }

  async function executeBatchDownload(itemsToDownload, folderName) {
    if (!itemsToDownload || itemsToDownload.length === 0) return;

    if (downloadPhotosBtn) downloadPhotosBtn.disabled = true;
    if (downloadSelectedPhotosBtn) downloadSelectedPhotosBtn.disabled = true;
    if (downloadPhotosProgress) downloadPhotosProgress.style.display = "block";

    const total = itemsToDownload.length;
    let successCount = 0;

    for (let i = 0; i < total; i++) {
      const item = itemsToDownload[i];
      if (downloadPhotosProgressText) {
        downloadPhotosProgressText.innerHTML = `Processando foto <strong>${i + 1} de ${total}</strong> em JPG máxima qualidade...`;
      }

      try {
        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              action: "DOWNLOAD_SINGLE_PHOTO",
              payload: {
                photo: item.photo,
                folderName,
                index: item.originalIndex || (i + 1),
                total,
              },
            },
            (r) => {
              if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
              else resolve(r || { success: false });
            }
          );
        });

        if (res?.success) {
          successCount++;
          if (res.requiresClientDownload && res.dataUrl) {
            const a = document.createElement("a");
            a.href = res.dataUrl;
            a.download = res.filename.split("/").pop() || `foto_${i + 1}.jpg`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
        }
      } catch (err) {
        console.warn(`Erro ao baixar foto ${i + 1}:`, err);
      }
    }

    if (downloadPhotosBtn) downloadPhotosBtn.disabled = false;
    if (downloadSelectedPhotosBtn) downloadSelectedPhotosBtn.disabled = false;

    if (successCount > 0) {
      if (downloadPhotosProgressText) {
        downloadPhotosProgressText.innerHTML = `✅ <strong>${successCount} fotos salvas em JPG na melhor qualidade!</strong><br><span style="font-size:10px; color:#64748B;">Pasta: Downloads/${folderName}</span>`;
      }
      showFeedback(`✅ ${successCount} fotos salvas em JPG na pasta Downloads/${folderName}!`, "success");
    } else {
      if (downloadPhotosProgressText) {
        downloadPhotosProgressText.innerHTML = `❌ Falha ao converter e baixar fotos. Verifique a conexão com a internet.`;
      }
      showFeedback("Falha ao baixar as fotos do anúncio.", "error");
    }
  }

  async function downloadSinglePhotoDirect(photo, index, total, folderName, btnElement) {
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.innerHTML = "⏳";
    }
    if (downloadPhotosProgress) downloadPhotosProgress.style.display = "block";
    if (downloadPhotosProgressText) {
      downloadPhotosProgressText.innerHTML = `Baixando foto <strong>#${index}</strong> em JPG...`;
    }

    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "DOWNLOAD_SINGLE_PHOTO",
            payload: {
              photo,
              folderName,
              index,
              total,
            },
          },
          (r) => {
            if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
            else resolve(r || { success: false });
          }
        );
      });

      if (res?.success) {
        if (res.requiresClientDownload && res.dataUrl) {
          const a = document.createElement("a");
          a.href = res.dataUrl;
          a.download = res.filename.split("/").pop() || `foto_${index}.jpg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        if (btnElement) btnElement.innerHTML = "✓";
        if (downloadPhotosProgressText) {
          downloadPhotosProgressText.innerHTML = `✅ <strong>Foto #${index} salva em JPG!</strong><br><span style="font-size:10px; color:#64748B;">Downloads/${folderName}</span>`;
        }
        showFeedback(`✅ Foto #${index} salva em JPG!`, "success");
      } else {
        if (btnElement) btnElement.innerHTML = "❌";
        showFeedback(`Erro ao baixar foto #${index}.`, "error");
      }
    } catch {
      if (btnElement) btnElement.innerHTML = "❌";
      showFeedback(`Erro ao baixar foto #${index}.`, "error");
    } finally {
      setTimeout(() => {
        if (btnElement) {
          btnElement.disabled = false;
          btnElement.innerHTML = "⬇";
        }
      }, 2500);
    }
  }

  function renderPhotosGallery(photos) {
    if (!photosGrid) return;
    photosGrid.innerHTML = "";
    selectedPhotoIndices.clear();
    updateSelectedCount();

    if (!photos || photos.length === 0) {
      photosGrid.innerHTML = `<div style="grid-column: 1 / -1; font-size: 11px; color: #64748B; text-align: center; padding: 12px 0;">Nenhuma foto encontrada neste anúncio.</div>`;
      return;
    }

    if (galleryHeaderCount) {
      galleryHeaderCount.innerText = `${photos.length} fotos disponíveis:`;
    }

    const externalId = currentScrapedData?.external_id || "Anuncio";
    const folderName = `Fotos_${externalId}`;

    photos.forEach((photo, idx) => {
      const card = document.createElement("div");
      card.className = "photo-thumb-card";
      card.title = `Foto #${idx + 1} - Clique para marcar ou no botão ⬇ para baixar avulsa`;

      const imgUrl = photo?.primaryUrl || photo?.originalUrl || photo?.url || (typeof photo === "string" ? photo : "");

      const badge = document.createElement("span");
      badge.className = "photo-thumb-badge";
      badge.innerText = `#${idx + 1}`;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "photo-thumb-checkbox";
      cb.title = "Selecionar esta foto";

      const img = document.createElement("img");
      img.className = "photo-thumb-img";
      img.src = imgUrl;
      img.loading = "lazy";
      img.onerror = () => { img.style.opacity = "0.3"; };

      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.className = "photo-thumb-download-btn";
      dlBtn.title = `Baixar apenas a foto #${idx + 1} em JPG`;
      dlBtn.innerHTML = "⬇";

      card.appendChild(badge);
      card.appendChild(cb);
      card.appendChild(img);
      card.appendChild(dlBtn);

      const toggleSelection = () => {
        if (selectedPhotoIndices.has(idx)) {
          selectedPhotoIndices.delete(idx);
          cb.checked = false;
          card.classList.remove("selected");
        } else {
          selectedPhotoIndices.add(idx);
          cb.checked = true;
          card.classList.add("selected");
        }
        updateSelectedCount();
      };

      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        if (cb.checked) {
          selectedPhotoIndices.add(idx);
          card.classList.add("selected");
        } else {
          selectedPhotoIndices.delete(idx);
          card.classList.remove("selected");
        }
        updateSelectedCount();
      });

      card.addEventListener("click", () => {
        toggleSelection();
      });

      dlBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        downloadSinglePhotoDirect(photo, idx + 1, photos.length, folderName, dlBtn);
      });

      photosGrid.appendChild(card);
    });
  }

  // Alternar visualização da Galeria de Fotos
  if (toggleGalleryBtn) {
    toggleGalleryBtn.addEventListener("click", async () => {
      const isHidden = photosGalleryContainer.style.display === "none";
      if (isHidden) {
        photosGalleryContainer.style.display = "block";
        toggleGalleryBtn.innerText = "✕ Fechar Fotos";
        toggleGalleryBtn.style.backgroundColor = "#F1F5F9";
        const photos = await ensurePhotosLoaded();
        renderPhotosGallery(photos);
      } else {
        photosGalleryContainer.style.display = "none";
        toggleGalleryBtn.innerText = "🖼️ Escolher Fotos";
        toggleGalleryBtn.style.backgroundColor = "";
      }
    });
  }

  // Botões Selecionar Todas / Nenhuma
  if (selectAllPhotosBtn) {
    selectAllPhotosBtn.addEventListener("click", () => {
      const cards = photosGrid?.querySelectorAll(".photo-thumb-card") || [];
      cards.forEach((card, idx) => {
        selectedPhotoIndices.add(idx);
        card.classList.add("selected");
        const cb = card.querySelector(".photo-thumb-checkbox");
        if (cb) cb.checked = true;
      });
      updateSelectedCount();
    });
  }

  if (deselectAllPhotosBtn) {
    deselectAllPhotosBtn.addEventListener("click", () => {
      selectedPhotoIndices.clear();
      const cards = photosGrid?.querySelectorAll(".photo-thumb-card") || [];
      cards.forEach((card) => {
        card.classList.remove("selected");
        const cb = card.querySelector(".photo-thumb-checkbox");
        if (cb) cb.checked = false;
      });
      updateSelectedCount();
    });
  }

  // Baixar Selecionadas
  if (downloadSelectedPhotosBtn) {
    downloadSelectedPhotosBtn.addEventListener("click", async () => {
      const photos = await ensurePhotosLoaded();
      const externalId = currentScrapedData?.external_id || "Anuncio";
      const folderName = `Fotos_${externalId}`;

      const itemsToDownload = Array.from(selectedPhotoIndices)
        .sort((a, b) => a - b)
        .map((idx) => ({
          photo: photos[idx],
          originalIndex: idx + 1,
        }));

      if (itemsToDownload.length === 0) {
        showFeedback("Selecione pelo menos uma foto para baixar.", "error");
        return;
      }

      await executeBatchDownload(itemsToDownload, folderName);
    });
  }

  // Baixar Todas as Fotos do Anúncio em JPG na melhor resolução
  if (downloadPhotosBtn) {
    downloadPhotosBtn.addEventListener("click", async () => {
      const photos = await ensurePhotosLoaded();
      if (photos.length === 0) {
        showFeedback("Nenhuma foto encontrada neste anúncio para download.", "error");
        return;
      }

      const externalId = currentScrapedData?.external_id || "Anuncio";
      const folderName = `Fotos_${externalId}`;
      const itemsToDownload = photos.map((photo, i) => ({
        photo,
        originalIndex: i + 1,
      }));

      await executeBatchDownload(itemsToDownload, folderName);
      downloadPhotosBtn.innerText = `📸 Baixar Novamente (${photos.length})`;
    });
  }

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

  // Abrir Espião de Concorrentes no ERP
  const openCompetitorsErpBtn = document.getElementById("openCompetitorsErpBtn");
  if (openCompetitorsErpBtn) {
    openCompetitorsErpBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "GET_STATUS" }, (status) => {
        const erpUrl = normalizeErpUrl(status?.erpUrl || erpUrlInput?.value);
        chrome.tabs.create({ url: `${erpUrl}/inteligencia?tab=lojas` });
      });
    });
  }

  // Salva no storage a seleção do anúncio para sincronia
  myListingSelect.addEventListener("change", () => {
    chrome.storage.local.set({ selectedMyListingId: myListingSelect.value });
    renderSelectedCard(myListingSelect.value);
    updateButtonLabel();
  });

  function normalizeStr(val) {
    return (val || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function highlightMatches(text, query) {
    if (!query || !text) return escapeHtml(text);
    const rawText = String(text);
    const normText = normalizeStr(rawText);
    const normQuery = normalizeStr(query);

    const matchIndex = normText.indexOf(normQuery);
    if (matchIndex === -1) return escapeHtml(rawText);

    const before = escapeHtml(rawText.slice(0, matchIndex));
    const matched = escapeHtml(rawText.slice(matchIndex, matchIndex + query.length));
    const after = escapeHtml(rawText.slice(matchIndex + query.length));

    return `${before}<mark class="search-highlight">${matched}</mark>${after}`;
  }

  function selectListing(id, shouldSave = true) {
    const targetId = id || "";
    myListingSelect.value = targetId;
    if (shouldSave) {
      chrome.storage.local.set({ selectedMyListingId: targetId });
    }
    renderSelectedCard(targetId);
    updateButtonLabel();
    closeDropdown();
  }

  function openDropdown() {
    isDropdownOpen = true;
    if (searchBoxWrapper) searchBoxWrapper.style.display = "flex";
    if (listingDropdownList) listingDropdownList.style.display = "block";
    if (listingSearchInput) {
      listingSearchInput.focus();
      listingSearchInput.select();
    }
    renderDropdownList();
  }

  function closeDropdown() {
    isDropdownOpen = false;
    if (searchBoxWrapper) searchBoxWrapper.style.display = "none";
    if (listingDropdownList) listingDropdownList.style.display = "none";
  }

  function toggleDropdown() {
    if (isDropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  if (btnToggleDropdown) {
    btnToggleDropdown.addEventListener("click", toggleDropdown);
  }

  if (btnResetToRadar) {
    btnResetToRadar.addEventListener("click", () => {
      selectListing("", true);
      showFeedback("Modo alterado para Radar de Mercado (sem vínculo)", "success");
    });
  }

  // Chips de filtro por marketplace
  if (platformChips) {
    platformChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".platform-chip");
      if (!chip) return;
      const targetPlatform = chip.dataset.platform;
      activePlatformFilter = targetPlatform;

      platformChips.querySelectorAll(".platform-chip").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.platform === targetPlatform);
      });

      renderDropdownList();
    });
  }

  // Campo de busca em tempo real
  if (listingSearchInput) {
    listingSearchInput.addEventListener("input", () => {
      const query = listingSearchInput.value.trim();
      if (listingSearchClear) {
        listingSearchClear.style.display = query ? "block" : "none";
      }
      renderDropdownList();
    });

    listingSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDropdown();
        return;
      }

      const items = listingDropdownList?.querySelectorAll(".listing-item") || [];
      if (items.length === 0) return;

      let currentIndex = -1;
      items.forEach((item, idx) => {
        if (item.classList.contains("active-nav")) currentIndex = idx;
      });

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items.forEach((item) => item.classList.remove("active-nav"));
        items[nextIndex].classList.add("active-nav");
        items[nextIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items.forEach((item) => item.classList.remove("active-nav"));
        items[prevIndex].classList.add("active-nav");
        items[prevIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const activeItem = listingDropdownList.querySelector(".listing-item.active-nav") || items[0];
        if (activeItem) {
          const id = activeItem.dataset.id || "";
          selectListing(id, true);
        }
      }
    });
  }

  if (listingSearchClear) {
    listingSearchClear.addEventListener("click", () => {
      listingSearchInput.value = "";
      listingSearchClear.style.display = "none";
      renderDropdownList();
      listingSearchInput.focus();
    });
  }

  function renderSelectedCard(selectedId) {
    if (!selectedListingCard) return;

    if (!selectedId) {
      selectedListingCard.className = "selected-listing-card radar-mode";
      if (selectedSkuTag) selectedSkuTag.innerText = "📡 MODO RADAR";
      if (selectedPriceTag) selectedPriceTag.innerText = "Sem vínculo direto";
      if (selectedTitleText) {
        selectedTitleText.innerText = "Radar de Mercado (Monitorar sem anúncio próprio)";
      }
      if (btnResetToRadar) btnResetToRadar.style.display = "none";
      if (btnToggleDropdown) btnToggleDropdown.innerText = "🔍 Buscar / Vincular a Anúncio Próprio";
      return;
    }

    const item = allMyListings.find((i) => String(i.id) === String(selectedId));
    if (item) {
      selectedListingCard.className = "selected-listing-card";
      if (selectedSkuTag) {
        selectedSkuTag.innerText = item.product_sku ? `SKU: ${item.product_sku}` : "SEM SKU";
      }
      if (selectedPriceTag) {
        selectedPriceTag.innerText = `R$ ${Number(item.current_price || 0).toFixed(2)}`;
      }
      if (selectedTitleText) {
        const platformLabel = item.platform === "mercadolivre" ? "ML" : item.platform === "shopee" ? "Shopee" : "";
        selectedTitleText.innerHTML = `${platformLabel ? `<strong>[${platformLabel}]</strong> ` : ""}${escapeHtml(item.title)}`;
      }
      if (btnResetToRadar) btnResetToRadar.style.display = "inline-flex";
      if (btnToggleDropdown) btnToggleDropdown.innerText = "🔄 Trocar Anúncio";
    } else {
      // Caso o ID salvo não esteja na lista carregada
      selectedListingCard.className = "selected-listing-card";
      if (selectedSkuTag) selectedSkuTag.innerText = "ANÚNCIO VINCULADO";
      if (selectedPriceTag) selectedPriceTag.innerText = "";
      if (selectedTitleText) selectedTitleText.innerText = `ID: ${selectedId}`;
      if (btnResetToRadar) btnResetToRadar.style.display = "inline-flex";
      if (btnToggleDropdown) btnToggleDropdown.innerText = "🔄 Trocar Anúncio";
    }
  }

  function renderDropdownList() {
    if (!listingDropdownList) return;

    const query = (listingSearchInput?.value || "").trim();
    const queryNorm = normalizeStr(query);

    // Filtra por plataforma
    let filtered = allMyListings;
    if (activePlatformFilter && activePlatformFilter !== "all") {
      filtered = filtered.filter((i) => i.platform === activePlatformFilter);
    }

    // Filtra por termo de busca
    if (queryNorm) {
      filtered = filtered.filter((item) => {
        const titleMatch = normalizeStr(item.title).includes(queryNorm);
        const skuMatch = normalizeStr(item.product_sku || "").includes(queryNorm);
        const idMatch = normalizeStr(item.external_id || "").includes(queryNorm);
        return titleMatch || skuMatch || idMatch;
      });
    }

    // Atualiza contador no cabeçalho
    if (listingCountBadge) {
      if (allMyListings.length === 0) {
        listingCountBadge.innerText = "0 anúncios";
      } else if (filtered.length === allMyListings.length) {
        listingCountBadge.innerText = `${allMyListings.length} anúncios disponíveis`;
      } else {
        listingCountBadge.innerText = `${filtered.length} de ${allMyListings.length}`;
      }
    }

    const currentSelectedId = myListingSelect.value || "";

    let html = "";

    // Opção 1 fixa no topo: Modo Radar
    const isRadarSelected = !currentSelectedId;
    html += `
      <div class="listing-item radar-option ${isRadarSelected ? "selected" : ""}" data-id="">
        <div class="item-meta-row">
          <span class="item-sku" style="background:#D1FAE5; color:#065F46;">📡 MODO RADAR</span>
          <span style="font-size:10px; font-weight:600; color:#059669;">Livre</span>
        </div>
        <div class="item-title">
          <strong>Radar de Mercado</strong> (Monitorar sem vincular a anúncio próprio)
        </div>
      </div>
    `;

    if (filtered.length === 0 && query) {
      html += `
        <div class="empty-search-state">
          Nenhum anúncio encontrado para <strong>&quot;${escapeHtml(query)}&quot;</strong>.
          <br>
          <button type="button" class="btn btn-secondary" id="btnEmptyClear" style="width:auto; padding:4px 8px; font-size:10px; margin-top:6px;">
            ✕ Limpar Busca
          </button>
        </div>
      `;
    } else {
      filtered.forEach((item) => {
        const isSelected = String(item.id) === String(currentSelectedId);
        const skuDisplay = item.product_sku ? `[${item.product_sku}]` : "[Sem SKU]";
        const priceFormatted = Number(item.current_price || 0).toFixed(2);
        const isShopee = item.platform === "shopee";
        const platformBadge = isShopee
          ? `<span class="item-platform-badge shopee">Shopee</span>`
          : `<span class="item-platform-badge">ML</span>`;

        html += `
          <div class="listing-item ${isSelected ? "selected" : ""}" data-id="${item.id}">
            <div class="item-meta-row">
              <span class="item-sku">${highlightMatches(skuDisplay, query)}</span>
              <div style="display:flex; align-items:center; gap:4px;">
                ${platformBadge}
                <span class="item-price">R$ ${priceFormatted}</span>
                ${isSelected ? `<span style="color:#2563EB; font-weight:700; font-size:11px;">✓</span>` : ""}
              </div>
            </div>
            <div class="item-title">
              ${highlightMatches(item.title, query)}
            </div>
          </div>
        `;
      });
    }

    listingDropdownList.innerHTML = html;

    // Conecta cliques nos itens
    listingDropdownList.querySelectorAll(".listing-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.id || "";
        selectListing(id, true);
      });
    });

    const emptyClear = listingDropdownList.querySelector("#btnEmptyClear");
    if (emptyClear) {
      emptyClear.addEventListener("click", () => {
        if (listingSearchInput) listingSearchInput.value = "";
        if (listingSearchClear) listingSearchClear.style.display = "none";
        renderDropdownList();
        if (listingSearchInput) listingSearchInput.focus();
      });
    }
  }

  // Carrega catálogo completo de anúncios próprios do usuário autenticado no ERP
  async function loadMyListings(platform) {
    if (listingSelectContainer) listingSelectContainer.style.display = "block";
    if (listingCountBadge) listingCountBadge.innerText = "Carregando anúncios...";

    // Define plataforma inicial no chip
    if (platform && (platform === "mercadolivre" || platform === "shopee")) {
      activePlatformFilter = platform;
    } else {
      activePlatformFilter = "all";
    }

    if (platformChips) {
      platformChips.querySelectorAll(".platform-chip").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.platform === activePlatformFilter);
      });
    }

    // Solicita todos os anúncios (limit 1000) para permitir busca instantânea e alternância de abas
    chrome.runtime.sendMessage({ action: "GET_MY_LISTINGS", platform: "all" }, (res) => {
      allMyListings = res?.items || [];

      // Popula select nativo com todas as opções para compatibilidade retroativa total
      if (allMyListings.length > 0) {
        let optionsHtml = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
        optionsHtml += `<optgroup label="Vincular a um Anúncio Próprio:">`;
        allMyListings.forEach((item) => {
          optionsHtml += `<option value="${item.id}">[${item.product_sku || "Sem SKU"}] ${escapeHtml(item.title.slice(0, 40))}... (R$ ${Number(item.current_price).toFixed(2)})</option>`;
        });
        optionsHtml += `</optgroup>`;
        myListingSelect.innerHTML = optionsHtml;

        if (listingHint) {
          listingHint.innerHTML = "💡 Dica: Escolha seu anúncio para comparar Buybox e monitorar concorrentes diretamente.";
        }

        chrome.storage.local.get(["selectedMyListingId"], (store) => {
          const storedId = store.selectedMyListingId || "";
          myListingSelect.value = storedId;
          renderSelectedCard(storedId);
          updateButtonLabel();
        });
      } else {
        myListingSelect.innerHTML = `<option value="">📡 Radar de Mercado (Monitorar sem anúncio próprio)</option>`;
        if (listingHint) {
          listingHint.innerHTML = "💡 Concorrentes serão monitorados diretamente no <strong>Radar de Mercado</strong> do ERP.";
        }
        renderSelectedCard("");
        updateButtonLabel();
      }

      renderDropdownList();
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
