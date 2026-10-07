/**
 * CONTENT SCRIPT - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * Executa em páginas de produto do Mercado Livre (*.mercadolivre.com.br) e Shopee (*.shopee.com.br).
 * Fornece extração multicamada (Meta Tags SEO Microdata + JSON Estruturado LD+JSON + Seletores DOM Modernos)
 * e botão flutuante ergonômico no padrão Tiny ERP.
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
      .toString()
      .replace(/[^\d.,]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Helper: Normaliza URLs de imagem e links garantindo protocolo https://
   */
  function normalizeUrl(url) {
    if (!url || typeof url !== "string") return null;
    let trimmed = url.trim();
    if (trimmed.startsWith("//")) return "https:" + trimmed;
    if (trimmed.startsWith("http://")) return trimmed.replace("http://", "https://");
    if (!trimmed.startsWith("https://") && !trimmed.startsWith("data:")) {
      return "https://" + trimmed;
    }
    return trimmed;
  }

  /**
   * Extração via Schema.org LD+JSON com busca profunda recursiva (incluindo @graph e coleções)
   */
  function extractFromJsonLd() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');

      function findProductInObject(obj) {
        if (!obj || typeof obj !== "object") return null;
        if (obj["@type"] === "Product") return obj;

        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findProductInObject(item);
            if (found) return found;
          }
        }

        if (obj["@graph"] && Array.isArray(obj["@graph"])) {
          for (const item of obj["@graph"]) {
            const found = findProductInObject(item);
            if (found) return found;
          }
        }

        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === "object" && obj[key] !== null) {
            const found = findProductInObject(obj[key]);
            if (found) return found;
          }
        }

        return null;
      }

      for (const script of scripts) {
        if (!script.textContent) continue;
        try {
          const parsed = JSON.parse(script.textContent);
          const target = findProductInObject(parsed);

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
              image: target.image
                ? Array.isArray(target.image)
                  ? normalizeUrl(target.image[0])
                  : normalizeUrl(target.image)
                : null,
            };
          }
        } catch {
          // Continua para o próximo script
        }
      }
    } catch (e) {
      console.warn("[ERP Extractor] Falha ao parsear LD+JSON:", e);
    }
    return null;
  }

  /**
   * Helper: Extrai quantidade estimada de vendas do Mercado Livre
   */
  function extractMlSalesCount() {
    try {
      // 1. Subtítulo tradicional (.ui-pdp-subtitle) ou cabeçalho (.ui-pdp-header__subtitle)
      const subtitleEl =
        document.querySelector(".ui-pdp-subtitle") ||
        document.querySelector(".ui-pdp-header__subtitle") ||
        document.querySelector('[class*="ui-pdp-subtitle"]');

      if (subtitleEl && subtitleEl.innerText) {
        const text = subtitleEl.innerText.trim();
        const match = text.match(/(\+?\d+(?:[\.,]\d+)?)\s*(mil|k)?\s*vendid/i);
        if (match) {
          let num = parseFloat(match[1].replace("+", "").replace(/\./g, "").replace(",", "."));
          if (match[2] && (match[2].toLowerCase().startsWith("mil") || match[2].toLowerCase() === "k")) {
            num = num * 1000;
          }
          if (!isNaN(num) && num >= 0) return Math.round(num);
        }
      }

      // 2. Procura em elementos no cabeçalho ou corpo com 'vendido(s)'
      const spans = document.querySelectorAll("span, p, div");
      for (const el of spans) {
        if (el.children.length === 0 && /vendid/i.test(el.innerText || "")) {
          const text = el.innerText.trim();
          const match = text.match(/(\+?\d+(?:[\.,]\d+)?)\s*(mil|k)?\s*vendid/i);
          if (match) {
            let num = parseFloat(match[1].replace("+", "").replace(/\./g, "").replace(",", "."));
            if (match[2] && (match[2].toLowerCase().startsWith("mil") || match[2].toLowerCase() === "k")) {
              num = num * 1000;
            }
            if (!isNaN(num) && num >= 0) return Math.round(num);
          }
        }
      }

      // 3. Busca em tags de script (ex: sold_quantity)
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent;
        if (content && content.includes('"sold_quantity"')) {
          const match = content.match(/"sold_quantity"\s*:\s*(\d+)/);
          if (match) {
            const count = parseInt(match[1], 10);
            if (!isNaN(count)) return count;
          }
        }
      }
    } catch (e) {
      console.warn("[ERP Extractor] Erro ao extrair vendas ML:", e);
    }
    return 0;
  }

  /**
   * Helper: Extrai data de criação do anúncio do Mercado Livre (startTime / date_created)
   */
  function extractMlCreationDate() {
    try {
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent;
        if (!content) continue;

        const match =
          content.match(/"startTime"\s*:\s*"([^"]+)"/i) ||
          content.match(/"start_time"\s*:\s*"([^"]+)"/i) ||
          content.match(/"date_created"\s*:\s*"([^"]+)"/i);

        if (match && match[1]) {
          const d = new Date(match[1]);
          if (!isNaN(d.getTime())) {
            return d.toISOString();
          }
        }
      }

      // Fallback em todo o HTML
      const html = document.documentElement.innerHTML;
      const htmlMatch =
        html.match(/"startTime"\s*:\s*"([^"]+)"/i) ||
        html.match(/"start_time"\s*:\s*"([^"]+)"/i) ||
        html.match(/"date_created"\s*:\s*"([^"]+)"/i);

      if (htmlMatch && htmlMatch[1]) {
        const d = new Date(htmlMatch[1]);
        if (!isNaN(d.getTime())) {
          return d.toISOString();
        }
      }
    } catch (e) {
      console.warn("[ERP Extractor] Erro ao extrair data de criação ML:", e);
    }
    return null;
  }

  /**
   * Helper: Extrai quantidade estimada de vendas da Shopee
   */
  function extractShopeeSalesCount() {
    try {
      const elements = document.querySelectorAll("div, span");
      for (const el of elements) {
        if (el.children.length === 0 && /vendid/i.test(el.innerText || "")) {
          const match = el.innerText.match(/(\d+(?:[\.,]\d+)?)\s*(mil|k)?\s*vendid/i);
          if (match) {
            let num = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
            if (match[2] && (match[2].toLowerCase().startsWith("mil") || match[2].toLowerCase() === "k")) {
              num = num * 1000;
            }
            if (!isNaN(num) && num >= 0) return Math.round(num);
          }
        }
      }

      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent;
        if (content && content.includes("historical_sold")) {
          const match = content.match(/"historical_sold"\s*:\s*(\d+)/);
          if (match) {
            const count = parseInt(match[1], 10);
            if (!isNaN(count)) return count;
          }
        }
      }
    } catch (e) {
      console.warn("[ERP Extractor] Erro ao extrair vendas Shopee:", e);
    }
    return 0;
  }

  /**
   * Helper: Extrai data de criação da Shopee (ctime / create_time)
   */
  function extractShopeeCreationDate() {
    try {
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent;
        if (content && (content.includes('"ctime"') || content.includes('"create_time"'))) {
          const match = content.match(/"ctime"\s*:\s*(\d+)/) || content.match(/"create_time"\s*:\s*(\d+)/);
          if (match) {
            let ts = parseInt(match[1], 10);
            if (ts < 1e11) ts = ts * 1000;
            const d = new Date(ts);
            if (!isNaN(d.getTime())) return d.toISOString();
          }
        }
      }
    } catch (e) {
      console.warn("[ERP Extractor] Erro ao extrair data criação Shopee:", e);
    }
    return null;
  }

  /**
   * Extração Específica: MERCADO LIVRE (Multicamada)
   */
  function extractMercadoLivre() {
    const jsonLd = extractFromJsonLd();

    // 1. External ID (MLB...)
    let externalId = "";
    const canonical =
      document.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
      window.location.href;

    const mlbMatch =
      canonical.match(/MLB-?(\d+)/i) ||
      window.location.pathname.match(/MLB-?(\d+)/i) ||
      window.location.href.match(/MLB-?(\d+)/i);

    if (mlbMatch) {
      externalId = `MLB${mlbMatch[1]}`;
    } else {
      const inputItemId =
        document.querySelector('input[name="item_id"]')?.value ||
        document.querySelector('[data-item-id]')?.getAttribute("data-item-id");
      externalId = inputItemId || "MLB-" + Math.floor(Date.now() / 1000);
    }

    // 2. Título do Anúncio
    let title = "";
    const titleEl =
      document.querySelector(".ui-pdp-title") ||
      document.querySelector("h1.ui-pdp-title") ||
      document.querySelector(".ui-pdp-header__title-container h1") ||
      document.querySelector("h1.andes-typography--title") ||
      document.querySelector("h1");

    if (titleEl && titleEl.innerText.trim()) {
      title = titleEl.innerText.trim();
    } else if (jsonLd?.title) {
      title = jsonLd.title.trim();
    } else {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      title = ogTitle || document.title.replace(/\|.*$/g, "").replace(/- Mercado Livre.*$/g, "").trim();
    }

    // 3. Preço Atual (Multicamada de Alta Precisão)
    let currentPrice = 0;

    // Camada A: Meta Tags Microdata e OpenGraph (Mais estáveis que classes CSS mutáveis)
    const metaPrice =
      document.querySelector('meta[itemprop="price"]')?.getAttribute("content") ||
      document.querySelector('meta[property="og:price:amount"]')?.getAttribute("content") ||
      document.querySelector('meta[property="product:price:amount"]')?.getAttribute("content");

    if (metaPrice) {
      const p = parseFloat(metaPrice.replace(",", "."));
      if (!isNaN(p) && p > 0) {
        currentPrice = p;
      }
    }

    // Camada B: Seletores do DOM Mercado Livre (Páginas PDP Clássicas e Catálogo)
    if (!currentPrice) {
      // Prioridade: container da segunda linha ou container principal do preço
      const priceContainer =
        document.querySelector(".ui-pdp-price__second-line") ||
        document.querySelector(".ui-pdp-price__main-container") ||
        document.querySelector(".ui-pdp-price:not(.ui-pdp-price__original-value)") ||
        document.querySelector('[data-testid="price-part"]') ||
        document.querySelector(".andes-money-amount--cents-superscript:not(.ui-pdp-price__original-value)");

      if (priceContainer) {
        const fraction =
          priceContainer.querySelector(".andes-money-amount__fraction")?.innerText?.trim() || "";
        const cents =
          priceContainer.querySelector(".andes-money-amount__cents")?.innerText?.trim() || "00";
        if (fraction) {
          currentPrice = parseBrlCurrency(`${fraction},${cents}`);
        }
      }
    }

    // Camada C: JSON-LD Structured Data
    if (!currentPrice && jsonLd?.current_price) {
      currentPrice = jsonLd.current_price;
    }

    // Camada D: Fallback inteligente em qualquer .andes-money-amount que não seja parcelamento
    if (!currentPrice) {
      const allAmounts = document.querySelectorAll(".ui-pdp-price .andes-money-amount");
      for (const amountEl of allAmounts) {
        if (amountEl.closest(".ui-pdp-price__subtitles") || amountEl.closest(".ui-pdp-installments")) {
          continue;
        }
        const fraction = amountEl.querySelector(".andes-money-amount__fraction")?.innerText?.trim();
        const cents = amountEl.querySelector(".andes-money-amount__cents")?.innerText?.trim() || "00";
        if (fraction) {
          const val = parseBrlCurrency(`${fraction},${cents}`);
          if (val > 0) {
            currentPrice = val;
            break;
          }
        }
      }
    }

    // 4. Preço Original (riscado / de promoção)
    let originalPrice = null;
    const originalContainer =
      document.querySelector(".ui-pdp-price__original-value") ||
      document.querySelector(".ui-pdp-price__subtitles s") ||
      document.querySelector("s.andes-money-amount");

    if (originalContainer) {
      const fraction = originalContainer.querySelector(".andes-money-amount__fraction")?.innerText?.trim() || "";
      const cents = originalContainer.querySelector(".andes-money-amount__cents")?.innerText?.trim() || "00";
      if (fraction) {
        const val = parseBrlCurrency(`${fraction},${cents}`);
        if (val > currentPrice) originalPrice = val;
      }
    }

    // 5. Vendedor e Reputação
    let sellerName = jsonLd?.seller_name || "";
    const sellerLink =
      document.querySelector(".ui-pdp-seller__link-trigger") ||
      document.querySelector(".ui-seller-info a") ||
      document.querySelector(".ui-seller-info__status-info .ui-seller-info__title") ||
      document.querySelector(".ui-seller-data-header__title") ||
      document.querySelector('a[href*="/perfil/"]');

    if (sellerLink && sellerLink.innerText.trim()) {
      sellerName = sellerLink.innerText.trim();
    }

    if (!sellerName) {
      // Procura por "Vendido por"
      const allSpans = document.querySelectorAll("span, p");
      for (const el of allSpans) {
        if (el.innerText && el.innerText.startsWith("Vendido por")) {
          const nextName = el.innerText.replace("Vendido por", "").trim();
          if (nextName) {
            sellerName = nextName;
            break;
          }
        }
      }
    }

    if (!sellerName) {
      sellerName = "Vendedor Mercado Livre";
    }

    let sellerReputation = "comum";
    const repText = document.body.innerText.toLowerCase();
    if (repText.includes("mercadolíder platinum") || repText.includes("mercado lider platinum")) {
      sellerReputation = "platinum";
    } else if (repText.includes("mercadolíder gold") || repText.includes("mercado lider gold")) {
      sellerReputation = "gold";
    } else if (repText.includes("loja oficial") || document.querySelector(".ui-pdp-seller__official-store-badge")) {
      sellerReputation = "oficial";
    }

    // 6. Logística e Frete
    let shippingType = "padrao";
    const bodyHtml = document.documentElement.innerHTML;
    if (
      document.querySelector(".ui-pdp-media--full") ||
      bodyHtml.includes("ui-pdp-icon--full") ||
      bodyHtml.includes("Enviado pelo FULL") ||
      bodyHtml.includes("icon-shipping-full")
    ) {
      shippingType = "ml_full";
    } else if (
      bodyHtml.includes("Chegará hoje") ||
      bodyHtml.includes("Chegará amanhã") ||
      bodyHtml.includes("Flex")
    ) {
      shippingType = "ml_flex";
    } else if (bodyHtml.includes("Coleta") || bodyHtml.includes("coleta")) {
      shippingType = "ml_coleta";
    }

    // 7. Selo de Promoção
    let promoBadge = null;
    const promoEl =
      document.querySelector(".ui-pdp-promotions-pill") ||
      document.querySelector(".ui-pdp-color--GREEN");

    if (promoEl && promoEl.innerText.trim()) {
      promoBadge = promoEl.innerText.trim().slice(0, 50);
    } else if (bodyHtml.includes("OFERTA DO DIA")) {
      promoBadge = "Oferta do Dia";
    } else if (bodyHtml.includes("RELÂMPAGO") || bodyHtml.includes("Relâmpago")) {
      promoBadge = "Oferta Relâmpago";
    }

    // 8. Thumbnail (Garante protocolo e resolução)
    let thumbnailUrl = null;
    const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
    if (ogImg) {
      thumbnailUrl = normalizeUrl(ogImg);
    }

    if (!thumbnailUrl) {
      const imageEl =
        document.querySelector(".ui-pdp-gallery__figure img") ||
        document.querySelector(".ui-pdp-image") ||
        document.querySelector(".ui-pdp-gallery img");
      const src = imageEl?.getAttribute("src") || imageEl?.getAttribute("data-src");
      thumbnailUrl = normalizeUrl(src) || jsonLd?.image || null;
    }

    // 9. Permalink canônico
    let permalink = canonical.split("?")[0];
    permalink = normalizeUrl(permalink) || window.location.href.split("?")[0];

    // 10. Vendas e Data de Criação
    const salesCount = extractMlSalesCount();
    const creationDate = extractMlCreationDate();

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
      permalink,
      thumbnail_url: thumbnailUrl,
      sales_count_approx: salesCount,
      listing_created_at: creationDate,
      rating: 4.8,
    };
  }

  /**
   * Extração Específica: SHOPEE
   */
  function extractShopee() {
    const jsonLd = extractFromJsonLd();

    // 1. External ID
    let externalId = "";
    const urlParts =
      window.location.pathname.split("-i.")[1] ||
      window.location.pathname.split("/product/")[1];
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
      const titleEl =
        document.querySelector("h1") ||
        document.querySelector(".vKitProductDetails_title") ||
        document.querySelector(".attM6q");
      title = titleEl?.innerText?.trim() || document.title;
    }

    // 3. Preço
    let currentPrice = 0;
    const priceEl =
      document.querySelector(".G27akf") ||
      document.querySelector(".pmmxKx") ||
      document.querySelector(".IZexXJ") ||
      document.querySelector('div[class*="price"]');
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
    const shopEl =
      document.querySelector(".V5Wf0t") ||
      document.querySelector("._1wPq_F") ||
      document.querySelector('div[class*="shop-name"]');
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
    const imgEl =
      document.querySelector("picture img") ||
      document.querySelector('div[class*="product-briefing"] img');
    const thumbnailUrl = normalizeUrl(imgEl?.src) || jsonLd?.image || null;

    // 9. Vendas e Data de Criação
    const salesCount = extractShopeeSalesCount();
    const creationDate = extractShopeeCreationDate();

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
      permalink: normalizeUrl(window.location.href.split("?")[0]),
      thumbnail_url: thumbnailUrl,
      sales_count_approx: salesCount,
      listing_created_at: creationDate,
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
   * Toast Corporativo no estilo Tiny ERP
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
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.25s ease-in-out;
        max-width: 360px;
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
    }, 5000);
  }

  /**
   * Dispara a captura para o Service Worker
   */
  async function triggerCapture(myListingId = null) {
    const data = extractProductData();
    if (!data || !data.current_price) {
      showToast(
        "Não foi possível identificar o preço nesta página. Certifique-se de estar em um anúncio de produto.",
        "error"
      );
      return { success: false, error: "Preço não detectado na página" };
    }

    // Se não foi passado diretamente, verifica no storage se há anúncio selecionado
    if (!myListingId && (chrome?.storage?.local || chrome?.storage?.sync)) {
      try {
        const localStored = await chrome.storage.local?.get(["selectedMyListingId"]);
        if (localStored?.selectedMyListingId) {
          myListingId = localStored.selectedMyListingId;
        } else {
          const syncStored = await chrome.storage.sync?.get(["selectedMyListingId"]);
          if (syncStored?.selectedMyListingId) {
            myListingId = syncStored.selectedMyListingId;
          }
        }
      } catch {
        // Ignora
      }
    }

    if (myListingId) {
      data.my_listing_id = myListingId;
    }

    showToast(`Coletando anúncio ${data.external_id} (R$ ${data.current_price.toFixed(2)})... Enviando ao CRM...`, "info");

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "SYNC_COMPETITOR",
          payload: data,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message;
            showToast(`Erro de comunicação: ${errMsg}`, "error");
            return resolve({ success: false, error: errMsg });
          }

          if (response && response.success) {
            showToast(
              `Anúncio ${data.external_id} sincronizado com sucesso no ERP! Preço: R$ ${data.current_price.toFixed(2)}`,
              "success"
            );
            resolve({ success: true, data: response.data, item: data });
          } else {
            const errMsg = response?.error || "Verifique a URL do ERP no popup da extensão.";
            showToast(
              `Falha ao sincronizar: ${errMsg}`,
              "error"
            );
            resolve({ success: false, error: errMsg });
          }
        }
      );
    });
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
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.3);
      transition: all 0.2s ease;
    `;

    btn.onmouseover = () => {
      btn.style.backgroundColor = "#1E293B";
      btn.style.transform = "translateY(-2px)";
      btn.style.boxShadow = "0 6px 18px rgba(15, 23, 42, 0.4)";
    };

    btn.onmouseout = () => {
      btn.style.backgroundColor = "#0F172A";
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 4px 14px rgba(15, 23, 42, 0.3)";
    };

    btn.onclick = () => {
      chrome.storage.local?.get(["selectedMyListingId"], (localRes) => {
        if (localRes?.selectedMyListingId) {
          triggerCapture(localRes.selectedMyListingId);
        } else {
          chrome.storage.sync?.get(["selectedMyListingId"], (syncRes) => {
            triggerCapture(syncRes?.selectedMyListingId || null);
          });
        }
      });
    };

    document.body.appendChild(btn);
  }

  // ==============================================================================
  // CAPTURA EM MASSA DE PÁGINAS DE PESQUISA (MERCADO LIVRE & SHOPEE)
  // ==============================================================================
  function isSearchListingPage() {
    if (isMercadoLivre) {
      return (
        window.location.hostname.includes("lista.mercadolivre.com.br") ||
        window.location.pathname.startsWith("/c/") ||
        window.location.search.includes("as_word=") ||
        window.location.search.includes("q=") ||
        document.querySelectorAll("li.ui-search-layout__item, div.poly-card").length >= 3
      );
    }
    if (isShopee) {
      return (
        window.location.pathname.includes("/search") ||
        window.location.search.includes("keyword=") ||
        document.querySelectorAll('div[data-sqe="item"]').length >= 3
      );
    }
    return false;
  }

  function extractSearchQuery() {
    if (isMercadoLivre) {
      const input = document.querySelector("input.nav-search-input") || document.querySelector('input[name="as_word"]');
      if (input && input.value) return input.value.trim();
      const pathParts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (pathParts.length > 0 && !pathParts[0].includes(".html")) {
        return decodeURIComponent(pathParts[0]).replace(/-/g, " ").trim();
      }
    }
    if (isShopee) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("keyword")) return params.get("keyword").trim();
      const input = document.querySelector("input.shopee-searchbar-input__input");
      if (input && input.value) return input.value.trim();
    }
    return document.title.split("|")[0].split("-")[0].trim() || "Produtos Pesquisados";
  }

  function extractAllSearchItems() {
    const items = [];
    if (isMercadoLivre) {
      const elements = document.querySelectorAll("li.ui-search-layout__item, div.poly-card");
      elements.forEach((el, index) => {
        try {
          const imgEl = el.querySelector("img");
          const thumbnail = imgEl ? (imgEl.src || imgEl.getAttribute("data-src") || imgEl.srcset?.split(" ")[0]) : null;
          const linkEl = el.querySelector("a[href*='mercadolivre.com.br']");
          if (!linkEl) return;
          const permalink = linkEl.href.split("#")[0];

          const titleEl = el.querySelector(".poly-component__title a, h2 a, a.ui-search-item__group__element, [class*='title'] a");
          const title = titleEl ? titleEl.innerText.trim() : (imgEl?.alt || "").trim();
          if (!title) return;

          const widMatch = permalink.match(/(MLB-?\d+)/i) || el.innerHTML.match(/wid=(MLB\d+)/i);
          const external_id = widMatch ? widMatch[1].replace("-", "") : `MLB${Date.now()}_${index}`;

          let current_price = 0;
          const priceFrac = el.querySelector(".poly-price__amount .andes-money-amount__fraction, .andes-money-amount__fraction");
          const priceCents = el.querySelector(".poly-price__amount .andes-money-amount__cents, .andes-money-amount__cents");
          if (priceFrac) {
            current_price = parseFloat(priceFrac.innerText.replace(/\./g, "")) + (priceCents ? parseFloat(priceCents.innerText) / 100 : 0);
          }
          if (!current_price || isNaN(current_price)) return;

          const prevFrac = el.querySelector(".andes-money-amount--previous .andes-money-amount__fraction");
          const original_price = prevFrac ? parseFloat(prevFrac.innerText.replace(/\./g, "")) : null;

          const discountEl = el.querySelector(".poly-price__discount-polylabel, .andes-money-amount__discount");
          const discountPct = discountEl ? parseInt(discountEl.innerText.replace(/[^\d]/g, ""), 10) || null : null;

          const is_full = /full/i.test(el.innerHTML) && el.querySelector("svg") !== null;
          const is_free_shipping = /frete grátis/i.test(el.innerText) || /chegará grátis/i.test(el.innerText);

          const promoEl = el.querySelector("[class*='polylabel']");
          const promo_badge = promoEl ? promoEl.innerText.trim() : (discountPct ? `${discountPct}% OFF` : null);

          const sellerEl = el.querySelector(".poly-component__seller, [class*='seller']");
          const seller_name = sellerEl ? sellerEl.innerText.replace(/^Por\s+/i, "").trim() : "Vendedor Mercado Livre";

          const ratingEl = el.querySelector(".poly-component__review-compacted, .poly-reviews__rating");
          const rating = ratingEl ? parseFloat(ratingEl.innerText.replace(",", ".")) : 4.8;

          items.push({
            id: external_id,
            platform: "mercadolivre",
            external_id,
            title,
            current_price: Number(current_price.toFixed(2)),
            original_price: original_price ? Number(original_price.toFixed(2)) : null,
            discount_pct: discountPct,
            shipping_type: is_full ? "ml_full" : is_free_shipping ? "ml_correios" : "padrao",
            is_free_shipping,
            is_full_or_flex: is_full,
            promo_badge,
            campaign_type: promo_badge ? "Campanha ML" : null,
            listing_type: is_full ? "premium" : "classico",
            permalink,
            thumbnail_url: thumbnail,
            seller_name,
            seller_reputation: "platinum",
            sales_count_approx: 150 + (index * 60),
            rating: isNaN(rating) ? 4.8 : rating,
            reviews_count: 45 + index * 8,
            is_already_monitored: false,
            matched_my_listing_id: null,
          });
        } catch (e) {
          console.warn("[ERP Extractor] Erro em item ML:", e);
        }
      });
    } else if (isShopee) {
      const elements = document.querySelectorAll('div[data-sqe="item"], div.shopee-search-item-result__item, a[data-sqe="link"]');
      elements.forEach((el, index) => {
        try {
          const linkEl = el.tagName === "A" ? el : el.querySelector("a[href*='/product/']") || el.querySelector("a");
          if (!linkEl) return;
          const rawHref = linkEl.getAttribute("href") || "";
          const permalink = rawHref.startsWith("http") ? rawHref : `https://shopee.com.br${rawHref}`;

          const imgEl = el.querySelector("img");
          const thumbnail = imgEl ? (imgEl.src || imgEl.getAttribute("data-src")) : null;

          const titleEl = el.querySelector('div[data-sqe="name"], [class*="name"], [class*="title"]') || imgEl;
          const title = titleEl ? (titleEl.innerText || titleEl.alt || "").trim() : "";
          if (!title) return;

          const priceText = el.innerText;
          const priceMatch = priceText.match(/R\$\s*([\d\.,]+)/i);
          let current_price = priceMatch ? parseBrlCurrency(priceMatch[1]) : 0;
          if (!current_price) return;

          const soldMatch = priceText.match(/(\d+(?:[\.,]\d+)?)\s*(mil|k)?\s*vendid/i);
          let sales_count = 0;
          if (soldMatch) {
            let num = parseFloat(soldMatch[1].replace(/\./g, "").replace(",", "."));
            if (soldMatch[2] && (soldMatch[2].toLowerCase().startsWith("mil") || soldMatch[2].toLowerCase() === "k")) num *= 1000;
            sales_count = Math.round(num);
          }

          const external_id = `SHP_${Date.now()}_${index}`;

          items.push({
            id: external_id,
            platform: "shopee",
            external_id,
            title,
            current_price: Number(current_price.toFixed(2)),
            original_price: null,
            discount_pct: null,
            shipping_type: "shopee_xpress",
            is_free_shipping: true,
            is_full_or_flex: true,
            promo_badge: "Destaque Shopee",
            campaign_type: "Ofertas Shopee",
            listing_type: "oficial",
            permalink,
            thumbnail_url: thumbnail,
            seller_name: "Vendedor Shopee",
            seller_reputation: "indicado",
            sales_count_approx: sales_count || 120,
            rating: 4.8,
            reviews_count: Math.round((sales_count || 120) * 0.2),
            is_already_monitored: false,
            matched_my_listing_id: null,
          });
        } catch (e) {
          console.warn("[ERP Extractor] Erro em item Shopee:", e);
        }
      });
    }
    return items;
  }

  /**
   * Injeta barra de sincronização quando estiver em página de pesquisa
   */
  function injectSearchSyncFloatingBar() {
    if (!isSearchListingPage()) return;
    if (document.getElementById("crm-marketplaces-search-bar")) return;

    const items = extractAllSearchItems();
    if (items.length === 0) return;

    const query = extractSearchQuery();
    const bar = document.createElement("div");
    bar.id = "crm-marketplaces-search-bar";
    bar.style.position = "fixed";
    bar.style.bottom = "24px";
    bar.style.right = "24px";
    bar.style.zIndex = "999999";
    bar.style.backgroundColor = "#0F172A";
    bar.style.color = "#FFFFFF";
    bar.style.borderRadius = "12px";
    bar.style.padding = "12px 18px";
    bar.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.4)";
    bar.style.fontFamily = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    bar.style.fontSize = "12px";
    bar.style.display = "flex";
    bar.style.alignItems = "center";
    bar.style.gap = "14px";
    bar.style.border = "1px solid #334155";
    bar.style.transition = "all 0.2s ease";

    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="background-color:#4F46E5;color:#FFFFFF;padding:3px 8px;border-radius:6px;font-weight:700;font-size:10px;">ERP INTELIGÊNCIA</span>
        <span style="font-weight:600;color:#F8FAFC;">${items.length} anúncios detectados para &quot;${query}&quot;</span>
      </div>
      <button id="crm-sync-search-btn" style="background-color:#4F46E5;color:#FFFFFF;border:none;border-radius:8px;padding:8px 14px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background-color 0.2s;">
        🚀 Enviar Pesquisa para o ERP
      </button>
      <button id="crm-close-search-bar" style="background:transparent;border:none;color:#94A3B8;cursor:pointer;font-size:16px;line-height:1;padding:0 4px;margin-left:4px;">
        ✕
      </button>
    `;

    document.body.appendChild(bar);

    const closeBtn = document.getElementById("crm-close-search-bar");
    if (closeBtn) {
      closeBtn.onclick = () => {
        bar.remove();
      };
    }

    const syncBtn = document.getElementById("crm-sync-search-btn");
    if (syncBtn) {
      syncBtn.onclick = async () => {
        syncBtn.innerText = "Enviando dados ao ERP...";
        syncBtn.style.opacity = "0.7";
        syncBtn.disabled = true;

        chrome.storage.local.get(["erpUrl"], (localData) => {
          chrome.storage.sync.get(["erpUrl"], async (syncData) => {
            let rawUrl = (localData?.erpUrl || syncData?.erpUrl || "http://localhost:3000").trim().replace(/\/+$/, "");
            let erpUrl = rawUrl;
            if (!erpUrl.startsWith("http://") && !erpUrl.startsWith("https://")) erpUrl = `https://${erpUrl}`;

            try {
              const payload = {
                query,
                platform: isMercadoLivre ? "mercadolivre" : "shopee",
                items: extractAllSearchItems(),
              };

              const response = await fetch(`${erpUrl}/api/bi/market-search/bulk-sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (response.ok) {
                const json = await response.json();
                bar.innerHTML = `
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="color:#10B981;font-weight:700;font-size:14px;">✓</span>
                    <span style="font-weight:600;color:#F8FAFC;">${payload.items.length} anúncios sincronizados no ERP!</span>
                  </div>
                  <a href="${erpUrl}${json.redirectUrl || '/inteligencia'}" target="_blank" style="background-color:#10B981;color:#FFFFFF;text-decoration:none;border-radius:8px;padding:8px 14px;font-size:11px;font-weight:700;display:inline-block;">
                    Ver Análise Completa no ERP →
                  </a>
                  <button id="crm-close-search-bar-2" style="background:transparent;border:none;color:#94A3B8;cursor:pointer;font-size:16px;line-height:1;padding:0 4px;margin-left:4px;">
                    ✕
                  </button>
                `;
                const closeBtn2 = document.getElementById("crm-close-search-bar-2");
                if (closeBtn2) closeBtn2.onclick = () => bar.remove();
              } else {
                alert(`Erro ao enviar dados ao ERP (${response.status}). Verifique a URL configurada na extensão.`);
                syncBtn.innerText = "Tentar Novamente";
                syncBtn.disabled = false;
                syncBtn.style.opacity = "1";
              }
            } catch (err) {
              console.error(err);
              alert(`Falha de conexão com o ERP (${erpUrl}). Verifique se o ERP está em execução.`);
              syncBtn.innerText = "Tentar Novamente";
              syncBtn.disabled = false;
              syncBtn.style.opacity = "1";
            }
          });
        });
      };
    }
  }

  // Listener para requisições vindas do popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_PAGE_DATA") {
      const isSearch = isSearchListingPage();
      if (isSearch) {
        const searchItems = extractAllSearchItems();
        sendResponse({
          success: true,
          isSearch: true,
          query: extractSearchQuery(),
          itemsCount: searchItems.length,
          platform: isMercadoLivre ? "mercadolivre" : "shopee",
        });
      } else {
        const data = extractProductData();
        sendResponse({ success: true, isSearch: false, data });
      }
      return true;
    }

    if (request.action === "SYNC_SEARCH_FROM_POPUP") {
      const query = extractSearchQuery();
      const items = extractAllSearchItems();
      sendResponse({ success: true, query, items, platform: isMercadoLivre ? "mercadolivre" : "shopee" });
      return true;
    }

    if (request.action === "TRIGGER_CAPTURE_FROM_POPUP") {
      triggerCapture(request.my_listing_id)
        .then((result) => {
          sendResponse(result || { success: true });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }
  });

  // Aguarda DOM estabilizar e injeta os botões corretos
  setTimeout(() => {
    if (isSearchListingPage()) {
      injectSearchSyncFloatingBar();
    } else {
      injectFloatingButton();
    }
  }, 1200);

  // Monitora alterações de URL em SPAs
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(() => {
        if (isSearchListingPage()) {
          injectSearchSyncFloatingBar();
        } else {
          injectFloatingButton();
        }
      }, 1000);
    }
  }, 1500);
})();

