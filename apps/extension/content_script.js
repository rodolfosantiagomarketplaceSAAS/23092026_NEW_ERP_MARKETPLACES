/**
 * CONTENT SCRIPT - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * Executa em páginas de produto do Mercado Livre (*.mercadolivre.com.br) e Shopee (*.shopee.com.br).
 * Fornece extração dupla (JSON Estruturado + Fallback de Seletores DOM) e botão flutuante ergonômico.
 */

(function () {
  "use strict";

  // Previne reinjeção múltipla
  if (window.__CRM_MARKETPLACES_CONTENT_INJECTED__) return;
  window.__CRM_MARKETPLACES_CONTENT_INJECTED__ = true;

  // Detecta plataforma
  const isMercadoLivre = window.location.hostname.includes("mercadolivre.com.br");
  const isShopee = window.location.hostname.includes("shopee.com.br");

  if (!isMercadoLivre && !isShopee) return;

  /**
   * Helper: Limpa e converte strings de moeda brasileira para float (Ex: "R$ 1.250,90" -> 1250.90)
   */
  function parseBrlCurrency(text) {
    if (!text) return 0;
    const clean = text
      .replace(/[^\d.,]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Extração via Schema.org LD+JSON
   */
  function extractFromJsonLd() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        if (!script.textContent) continue;
        const data = JSON.parse(script.textContent);

        const target = Array.isArray(data)
          ? data.find((item) => item["@type"] === "Product")
          : data["@type"] === "Product"
          ? data
          : null;

        if (target) {
          const offers = Array.isArray(target.offers) ? target.offers[0] : target.offers;
          const price = offers?.price ? parseFloat(offers.price) : 0;
          const seller = offers?.seller?.name || target.brand?.name || null;
          const sku = target.sku || offers?.sku || null;

          return {
            title: target.name || null,
            current_price: price > 0 ? price : null,
            seller_name: seller,
            sku: sku,
            image: target.image ? (Array.isArray(target.image) ? target.image[0] : target.image) : null,
          };
        }
      }
    } catch (e) {
      console.warn("[ERP Extractor] Falha ao parsear LD+JSON:", e);
    }
    return null;
  }

  /**
   * Extração Específica: MERCADO LIVRE
   */
  function extractMercadoLivre() {
    const jsonLd = extractFromJsonLd();

    // 1. External ID (MLB...)
    let externalId = "";
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || window.location.href;
    const mlbMatch = canonical.match(/MLB-?(\d+)/i) || window.location.pathname.match(/MLB-?(\d+)/i);
    if (mlbMatch) {
      externalId = `MLB${mlbMatch[1]}`;
    } else {
      const inputItemId = document.querySelector('input[name="item_id"]')?.value;
      externalId = inputItemId || "MLB-" + Math.floor(Date.now() / 1000);
    }

    // 2. Título
    const titleEl = document.querySelector(".ui-pdp-title") || document.querySelector("h1.ui-pdp-title") || document.querySelector("h1");
    const title = (titleEl?.innerText || jsonLd?.title || document.title || "").trim();

    // 3. Preço Atual
    let currentPrice = 0;
    const priceContainer = document.querySelector(".ui-pdp-price__second-line") || document.querySelector(".ui-pdp-price");
    if (priceContainer) {
      const fraction = priceContainer.querySelector(".andes-money-amount__fraction")?.innerText || "";
      const cents = priceContainer.querySelector(".andes-money-amount__cents")?.innerText || "00";
      if (fraction) {
        currentPrice = parseBrlCurrency(`${fraction},${cents}`);
      }
    }
    if (!currentPrice && jsonLd?.current_price) {
      currentPrice = jsonLd.current_price;
    }

    // 4. Preço Original (riscado)
    let originalPrice = null;
    const originalContainer = document.querySelector(".ui-pdp-price__original-value");
    if (originalContainer) {
      const fraction = originalContainer.querySelector(".andes-money-amount__fraction")?.innerText || "";
      const cents = originalContainer.querySelector(".andes-money-amount__cents")?.innerText || "00";
      if (fraction) {
        const val = parseBrlCurrency(`${fraction},${cents}`);
        if (val > currentPrice) originalPrice = val;
      }
    }

    // 5. Vendedor e Reputação
    let sellerName = jsonLd?.seller_name || "Mercado Livre Oficial";
    const sellerLink = document.querySelector(".ui-pdp-seller__link-trigger") || document.querySelector(".ui-seller-info a");
    if (sellerLink && sellerLink.innerText.trim()) {
      sellerName = sellerLink.innerText.trim();
    }

    let sellerReputation = "comum";
    const repText = document.body.innerText.toLowerCase();
    if (repText.includes("mercadolíder platinum") || repText.includes("mercado lider platinum")) {
      sellerReputation = "platinum";
    } else if (repText.includes("mercadolíder gold") || repText.includes("mercado lider gold")) {
      sellerReputation = "gold";
    } else if (repText.includes("loja oficial")) {
      sellerReputation = "oficial";
    }

    // 6. Logística e Frete
    let shippingType = "padrao";
    const bodyHtml = document.documentElement.innerHTML;
    if (document.querySelector(".ui-pdp-media--full") || bodyHtml.includes("ui-pdp-icon--full") || bodyHtml.includes("Enviado pelo FULL")) {
      shippingType = "ml_full";
    } else if (bodyHtml.includes("Chegará hoje") || bodyHtml.includes("Chegará amanhã") || bodyHtml.includes("Flex")) {
      shippingType = "ml_flex";
    } else if (bodyHtml.includes("Coleta") || bodyHtml.includes("coleta")) {
      shippingType = "ml_coleta";
    }

    // 7. Selo de Promoção
    let promoBadge = null;
    const promoEl = document.querySelector(".ui-pdp-promotions-pill") || document.querySelector(".ui-pdp-color--GREEN");
    if (promoEl && promoEl.innerText.trim()) {
      promoBadge = promoEl.innerText.trim().slice(0, 50);
    } else if (bodyHtml.includes("OFERTA DO DIA")) {
      promoBadge = "Oferta do Dia";
    } else if (bodyHtml.includes("RELÂMPAGO") || bodyHtml.includes("Relâmpago")) {
      promoBadge = "Oferta Relâmpago";
    }

    // 8. Thumbnail
    const imageEl = document.querySelector(".ui-pdp-gallery__figure img") || document.querySelector(".ui-pdp-image");
    const thumbnailUrl = imageEl?.src || jsonLd?.image || null;

    return {
      platform: "mercadolivre",
      external_id: externalId,
      title,
      current_price: currentPrice,
      original_price: originalPrice,
      seller_name: sellerName,
      seller_reputation: sellerReputation,
      shipping_type: shippingType,
      promo_badge: promoBadge,
      permalink: window.location.href.split("?")[0],
      thumbnail_url: thumbnailUrl,
      sales_count_approx: 100,
      rating: 4.8,
    };
  }

  /**
   * Extração Específica: SHOPEE
   */
  function extractShopee() {
    const jsonLd = extractFromJsonLd();

    // 1. External ID (ShopId.ItemId da URL)
    let externalId = "";
    const urlParts = window.location.pathname.split("-i.")[1] || window.location.pathname.split("/product/")[1];
    if (urlParts) {
      const ids = urlParts.replace(/\//g, "").split(".");
      if (ids.length >= 2) {
        externalId = `SHP_${ids[0]}_${ids[1]}`;
      } else {
        externalId = `SHP_${urlParts}`;
      }
    } else {
      externalId = "SHP_" + Math.floor(Date.now() / 1000);
    }

    // 2. Título
    let title = jsonLd?.title || "";
    if (!title) {
      const titleEl = document.querySelector("h1") || document.querySelector(".vKitProductDetails_title") || document.querySelector(".attM6q");
      title = titleEl?.innerText?.trim() || document.title;
    }

    // 3. Preço
    let currentPrice = 0;
    const priceEl = document.querySelector(".G27akf") || document.querySelector(".pmmxKx") || document.querySelector(".IZexXJ") || document.querySelector('div[class*="price"]');
    if (priceEl) {
      currentPrice = parseBrlCurrency(priceEl.innerText);
    }
    if (!currentPrice && jsonLd?.current_price) {
      currentPrice = jsonLd.current_price;
    }

    // 4. Preço Original
    let originalPrice = null;
    const origEl = document.querySelector(".v97Q2Z") || document.querySelector(".X9Vb1P");
    if (origEl) {
      const orig = parseBrlCurrency(origEl.innerText);
      if (orig > currentPrice) originalPrice = orig;
    }

    // 5. Vendedor e Reputação
    let sellerName = jsonLd?.seller_name || "Vendedor Shopee";
    const shopEl = document.querySelector(".V5Wf0t") || document.querySelector("._1wPq_F") || document.querySelector('div[class*="shop-name"]');
    if (shopEl?.innerText?.trim()) {
      sellerName = shopEl.innerText.trim();
    }

    let sellerReputation = "indicado";
    const bodyText = document.body.innerText;
    if (bodyText.includes("Shopee Mall") || document.querySelector('img[alt*="Shopee Mall"]')) {
      sellerReputation = "oficial";
    } else if (bodyText.includes("Indicado") || document.querySelector('div[class*="preferred-badge"]')) {
      sellerReputation = "indicado";
    }

    // 6. Logística
    let shippingType = "shopee_padrao";
    if (bodyText.includes("Shopee Xpress") || bodyText.includes("SPX Express")) {
      shippingType = "shopee_xpress";
    } else if (bodyText.includes("Frete grátis com cupom") || bodyText.includes("Frete Grátis")) {
      shippingType = "shopee_frete_gratis";
    }

    // 7. Promoções
    let promoBadge = null;
    if (bodyText.includes("Oferta Relâmpago") || bodyText.includes("Flash Sale")) {
      promoBadge = "Oferta Relâmpago";
    } else if (bodyText.includes("Leve Mais por Menos")) {
      promoBadge = "Combo Promocional";
    }

    // 8. Thumbnail
    const imgEl = document.querySelector("picture img") || document.querySelector('div[class*="product-briefing"] img');
    const thumbnailUrl = imgEl?.src || jsonLd?.image || null;

    return {
      platform: "shopee",
      external_id: externalId,
      title: title.trim(),
      current_price: currentPrice,
      original_price: originalPrice,
      seller_name: sellerName,
      seller_reputation: sellerReputation,
      shipping_type: shippingType,
      promo_badge: promoBadge,
      permalink: window.location.href.split("?")[0],
      thumbnail_url: thumbnailUrl,
      sales_count_approx: 50,
      rating: 4.7,
    };
  }

  /**
   * Coleta mestre que invoca a rotina correspondente
   */
  function extractProductData() {
    if (isMercadoLivre) {
      return extractMercadoLivre();
    } else if (isShopee) {
      return extractShopee();
    }
    return null;
  }

  /**
   * Toast Corporativo no estilo Tiny ERP (Compacto, Neutro com bordas sutis)
   */
  function showToast(message, type = "info") {
    let toast = document.getElementById("crm-erp-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "crm-erp-toast";
      toast.style.cssText = `
        position: fixed;
        bottom: 74px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        padding: 10px 14px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.25s ease-in-out;
        max-width: 320px;
      `;
      document.body.appendChild(toast);
    }

    const colors = {
      success: { bg: "#ECFDF5", border: "#10B981", text: "#065F46" },
      error: { bg: "#FEF2F2", border: "#EF4444", text: "#991B1B" },
      info: { bg: "#F8FAFC", border: "#0284C7", text: "#0F172A" },
    };

    const style = colors[type] || colors.info;
    toast.style.backgroundColor = style.bg;
    toast.style.border = `1px solid ${style.border}`;
    toast.style.color = style.text;
    toast.innerHTML = `<strong>ERP Marketplaces:</strong> ${message}`;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    setTimeout(() => {
      if (toast) {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
      }
    }, 4500);
  }

  /**
   * Dispara a captura para o Service Worker
   */
  async function triggerCapture(myListingId = null) {
    const data = extractProductData();
    if (!data || !data.current_price) {
      showToast("Não foi possível identificar o preço do anúncio nesta página.", "error");
      return;
    }

    if (myListingId) {
      data.my_listing_id = myListingId;
    }

    showToast("Enviando dados do concorrente ao ERP...", "info");

    chrome.runtime.sendMessage(
      {
        action: "SYNC_COMPETITOR",
        payload: data,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          showToast(`Erro de comunicação: ${chrome.runtime.lastError.message}`, "error");
          return;
        }

        if (response && response.success) {
          showToast(`Anúncio ${data.external_id} capturado e sincronizado com sucesso! Preço: R$ ${data.current_price.toFixed(2)}`, "success");
        } else {
          showToast(`Falha ao sincronizar: ${response?.error || "Verifique o Token de API no popup da extensão."}`, "error");
        }
      }
    );
  }

  /**
   * Injeta Floating Action Button Discreto (Tiny ERP Style)
   */
  function injectFloatingButton() {
    if (document.getElementById("crm-erp-floating-btn")) return;

    const btn = document.createElement("button");
    btn.id = "crm-erp-floating-btn";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      Capturar Concorrente (ERP)
    `;

    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999998;
      display: inline-flex;
      align-items: center;
      padding: 9px 16px;
      background-color: #0F172A;
      color: #FFFFFF;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid #334155;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
      transition: all 0.2s ease;
    `;

    btn.onmouseover = () => {
      btn.style.backgroundColor = "#1E293B";
      btn.style.transform = "translateY(-2px)";
      btn.style.boxShadow = "0 6px 16px rgba(15, 23, 42, 0.35)";
    };

    btn.onmouseout = () => {
      btn.style.backgroundColor = "#0F172A";
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.25)";
    };

    btn.onclick = () => {
      // Verifica se o usuário pré-selecionou um my_listing_id no popup storage
      chrome.storage.sync.get(["selectedMyListingId"], (res) => {
        triggerCapture(res.selectedMyListingId || null);
      });
    };

    document.body.appendChild(btn);
  }

  // Listener para requisições vindas do popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_PAGE_DATA") {
      const data = extractProductData();
      sendResponse({ success: true, data });
      return true;
    }

    if (request.action === "TRIGGER_CAPTURE_FROM_POPUP") {
      triggerCapture(request.my_listing_id);
      sendResponse({ success: true });
      return true;
    }
  });

  // Aguarda DOM estabilizar e injeta botão
  setTimeout(injectFloatingButton, 1200);
})();
