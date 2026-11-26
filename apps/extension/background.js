/**
 * BACKGROUND SERVICE WORKER - ERP MARKETPLACES INTELIGÊNCIA COMPETITIVA
 * - Conexão automática: recebe o token do ERP (content script na aba do ERP logado)
 * - Heartbeat periódico (chrome.alarms) + badge no ícone indicando status
 * - Proxy de todas as chamadas à API do ERP (imune a CORS das páginas)
 * - Extração Multicamada + Inspecionador em Background para páginas com proteção Anti-Bot
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

async function handleSyncStoreItems(rawErpUrl, payload) {
  const { data, erpUrl } = await postToErp("/api/competitors/stores/sync", payload, { erpUrl: rawErpUrl });
  return {
    success: true,
    count: payload.items?.length || 0,
    storeName: payload.store_name,
    erpUrl,
    redirectUrl: "/inteligencia?tab=lojas",
    ...data,
  };
}

async function handleSaveOpportunityListing(rawErpUrl, payload) {
  const { data, erpUrl } = await postToErp("/api/competitors/saved", payload, { erpUrl: rawErpUrl });
  return {
    success: true,
    erpUrl,
    redirectUrl: "/inteligencia?tab=salvos",
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

/**
 * Busca recursiva de Product em JSON-LD (incluindo @graph)
 */
function findProductInLd(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj["@type"] === "Product" || (Array.isArray(obj["@type"]) && obj["@type"].includes("Product"))) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const f = findProductInLd(item);
      if (f) return f;
    }
  }
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const f = findProductInLd(item);
      if (f) return f;
    }
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "object" && obj[k] !== null) {
      const f = findProductInLd(obj[k]);
      if (f) return f;
    }
  }
  return null;
}

/**
 * Extrator Multicamada de HTML no Service Worker
 */
function parseHtmlMultilayer(html, permalink, externalId) {
  if (!html || html.length < 300) return null;
  if (html.includes("/gz/account-verification")) return null;

  let title = null;
  let currentPrice = 0;
  let originalPrice = null;
  let sellerName = null;
  let sellerReputation = null;
  let shippingType = "padrao";
  let promoBadge = null;
  let thumbnailUrl = null;
  let salesCount = 0;

  // 1. JSON-LD (todos os blocos)
  const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = ldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(ldMatch[1].trim());
      const prod = findProductInLd(parsed);
      if (prod) {
        if (prod.name && !title) title = prod.name;
        const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
        if (offer?.price && !currentPrice) currentPrice = parseFloat(offer.price) || 0;
        if (offer?.seller?.name && !sellerName) sellerName = offer.seller.name;
        if (prod.image && !thumbnailUrl) {
          thumbnailUrl = Array.isArray(prod.image) ? prod.image[0] : prod.image;
        }
      }
    } catch {}
  }

  // 2. Meta tags OpenGraph & Microdata
  if (!currentPrice) {
    const metaPriceMatch =
      html.match(/<meta[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*property=["'](?:og|product):price:amount["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
    if (metaPriceMatch) {
      currentPrice = parseFloat(metaPriceMatch[1].replace(",", ".")) || 0;
    }
  }

  // Se for página de challenge JS sem preço no HTML, aborta extração estática para acionar aba background
  if (html.includes("bot-interceptor-muralla") && !currentPrice && !html.includes("andes-money-amount")) {
    return null;
  }

  // 3. Seletores DOM no HTML (Andes Money Amount)
  if (!currentPrice) {
    const secondLine = html.match(
      /class=["'][^"']*ui-pdp-price__second-line[^"']*["'][\s\S]{0,1500}?class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([\d.]+)<\/span>(?:[\s\S]{0,400}?class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>(\d{1,2})<\/span>)?/i
    );
    if (secondLine) {
      currentPrice = parseFloat(`${secondLine[1].replace(/\./g, "")}.${secondLine[2] || "00"}`) || 0;
    }
  }

  if (!originalPrice) {
    const origMatch = html.match(
      /class=["'][^"']*(?:ui-pdp-price__original-value|andes-money-amount--previous)[^"']*["'][\s\S]{0,1200}?class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([\d.]+)<\/span>(?:[\s\S]{0,400}?class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>(\d{1,2})<\/span>)?/i
    );
    if (origMatch) {
      const origVal = parseFloat(`${origMatch[1].replace(/\./g, "")}.${origMatch[2] || "00"}`) || 0;
      if (origVal > currentPrice) originalPrice = origVal;
    }
  }

  // 4. Preloaded State JSON
  if (!currentPrice) {
    const stateMatch =
      html.match(/"sale_price"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/i) ||
      html.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/i);
    if (stateMatch) {
      currentPrice = parseFloat(stateMatch[1]) || 0;
    }
  }

  if (!title) {
    const ogTitle =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (ogTitle) {
      title = ogTitle.replace(/\s*\|\s*Mercado\s*Livre.*$/i, "").trim();
    }
  }

  if (!thumbnailUrl) {
    const ogImg =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (ogImg && ogImg.startsWith("http") && !ogImg.includes("pt_logo_large_plus")) {
      thumbnailUrl = ogImg;
    }
  }

  if (html.includes("Enviado pelo FULL") || html.includes("ui-pdp-icon--full") || html.includes("ui-pdp-media--full")) {
    shippingType = "ml_full";
  } else if (html.includes("Chegará hoje") || html.includes("Flex")) {
    shippingType = "ml_flex";
  }

  if (/mercadol[íi]der\s+platinum/i.test(html)) sellerReputation = "platinum";
  else if (/mercadol[íi]der\s+gold/i.test(html)) sellerReputation = "gold";

  // Vendas estimadas restritas ao subtítulo principal do anúncio (.ui-pdp-subtitle)
  const pdpSubtitleMatch = html.match(/class=["'][^"']*ui-pdp-subtitle[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (pdpSubtitleMatch) {
    const subText = pdpSubtitleMatch[1].replace(/<[^>]+>/g, " ").trim();
    const subSold = subText.match(/(\+?\d+(?:[.,]\d+)?)\s*(mil|k)?\s*vendid/i);
    if (subSold) {
      let num = parseFloat(subSold[1].replace("+", "").replace(/\./g, "").replace(",", "."));
      if (subSold[2] && (subSold[2].toLowerCase().startsWith("mil") || subSold[2].toLowerCase() === "k")) {
        num *= 1000;
      }
      salesCount = !isNaN(num) && num >= 0 ? Math.round(num) : 0;
    } else {
      salesCount = 0;
    }
  }

  const discountMatch = html.match(/(\d{1,2}%\s*OFF)/i);
  if (discountMatch) promoBadge = discountMatch[1].toUpperCase();
  else if (html.includes("OFERTA DO DIA")) promoBadge = "OFERTA DO DIA";

  let listingCreatedAt = null;
  const jsonDateMatch =
    html.match(/"startTime"\s*:\s*"([^"]+)"/i) ||
    html.match(/"start_time"\s*:\s*"([^"]+)"/i) ||
    html.match(/"date_created"\s*:\s*"([^"]+)"/i);
  if (jsonDateMatch && jsonDateMatch[1]) {
    const d = new Date(jsonDateMatch[1]);
    if (!isNaN(d.getTime())) listingCreatedAt = d.toISOString();
  }
  if (!listingCreatedAt) {
    const relDaysMatch = html.match(/Publicado:?\s*h[áa]\s*(\d+)\s*dias?/i);
    if (relDaysMatch) {
      const days = parseInt(relDaysMatch[1], 10);
      if (!isNaN(days) && days >= 0 && days < 5000) {
        listingCreatedAt = new Date(Date.now() - days * 86400000).toISOString();
      }
    }
  }
  if (!listingCreatedAt) {
    const explicitDateMatch = html.match(/Publicado\s*(?:em|:)?\s*(\d{2})\/(\d{2})\/(20\d{2})/i);
    if (explicitDateMatch) {
      const day = parseInt(explicitDateMatch[1], 10);
      const month = parseInt(explicitDateMatch[2], 10) - 1;
      const year = parseInt(explicitDateMatch[3], 10);
      const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
      if (!isNaN(d.getTime())) listingCreatedAt = d.toISOString();
    }
  }

  if (currentPrice <= 0) return null;

  let listingType = "gold_special";
  const ltMatch = html.match(/"listing_type_id"\s*:\s*"(gold_pro|gold_special)"/i);
  if (ltMatch && ltMatch[1]) {
    listingType = ltMatch[1].toLowerCase();
  } else if (/sem\s+juros/i.test(html) && !/cart[ãa]o\s+mercado\s+pago/i.test(html)) {
    listingType = "gold_pro";
  }

  const saleFeePct = listingType === "gold_pro" ? 17 : 12;
  const fixedFee =
    currentPrice < 12.5 ? currentPrice / 2 : currentPrice < 29 ? 6.25 : currentPrice < 50 ? 6.5 : currentPrice < 79 ? 6.75 : 0;
  const saleFeeAmount = Number(((currentPrice * saleFeePct) / 100 + fixedFee).toFixed(2));
  let shippingCost = 22.45;
  if (currentPrice < 79) shippingCost = 0;
  else if (currentPrice < 100) shippingCost = 13.65;
  else if (currentPrice < 120) shippingCost = 16.85;
  else if (currentPrice < 150) shippingCost = 18.65;
  else if (currentPrice < 200) shippingCost = 20.45;

  return {
    title,
    current_price: currentPrice,
    original_price: originalPrice,
    seller_name: sellerName ? sellerName.replace(/^Vendido\s+por\s+/i, "").trim() : null,
    seller_reputation: sellerReputation,
    shipping_type: shippingType,
    promo_badge: promoBadge,
    thumbnail_url: thumbnailUrl,
    sales_count_approx: salesCount,
    listing_created_at: listingCreatedAt,
    listing_type: listingType,
    sale_fee_amount: saleFeeAmount,
    sale_fee_pct: saleFeePct,
    shipping_cost: shippingCost,
    permalink,
    external_id: externalId,
  };
}

/**
 * Fallback via Aba Silenciosa em Background (executa o JS real do Mercado Livre/Shopee com cookies do navegador)
 */
async function extractViaBackgroundTab(targetUrl, externalId) {
  let tabId = null;
  try {
    const createdTab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = createdTab.id;

    // Aguarda carregamento completo da página (e eventual redirecionamento do PoW challenge)
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 4500);
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          setTimeout(() => {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 900);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        function parseBrl(txt) {
          if (!txt) return 0;
          const clean = String(txt).replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
          return parseFloat(clean) || 0;
        }

        let price = 0;
        const metaPrice =
          document.querySelector('meta[itemprop="price"]')?.getAttribute("content") ||
          document.querySelector('meta[property="og:price:amount"]')?.getAttribute("content");
        if (metaPrice) price = parseFloat(metaPrice.replace(",", ".")) || 0;

        if (!price) {
          const container =
            document.querySelector(".ui-pdp-price__second-line") ||
            document.querySelector(".ui-pdp-price__main-container") ||
            document.querySelector(".ui-pdp-price:not(.ui-pdp-price__original-value)");
          if (container) {
            const frac = container.querySelector(".andes-money-amount__fraction")?.innerText?.trim() || "";
            const cents = container.querySelector(".andes-money-amount__cents")?.innerText?.trim() || "00";
            if (frac) price = parseBrl(`${frac},${cents}`);
          }
        }

        let origPrice = null;
        const origEl =
          document.querySelector(".ui-pdp-price__original-value") ||
          document.querySelector("s.andes-money-amount");
        if (origEl) {
          const frac = origEl.querySelector(".andes-money-amount__fraction")?.innerText?.trim() || "";
          const cents = origEl.querySelector(".andes-money-amount__cents")?.innerText?.trim() || "00";
          if (frac) {
            const v = parseBrl(`${frac},${cents}`);
            if (v > price) origPrice = v;
          }
        }

        const titleEl = document.querySelector(".ui-pdp-title") || document.querySelector("h1");
        const title = titleEl?.innerText?.trim() || null;

        let sellerName = null;
        const sellerEl =
          document.querySelector(".ui-pdp-seller__link-trigger") ||
          document.querySelector(".ui-seller-data-header__title") ||
          document.querySelector('a[href*="/perfil/"]');
        if (sellerEl?.innerText?.trim()) {
          sellerName = sellerEl.innerText.replace(/^Vendido\s+por\s+/i, "").trim();
        }

        let shippingType = "padrao";
        const html = document.documentElement.innerHTML;
        if (document.querySelector(".ui-pdp-media--full") || html.includes("Enviado pelo FULL") || html.includes("ui-pdp-icon--full")) {
          shippingType = "ml_full";
        } else if (html.includes("Chegará hoje") || html.includes("Flex")) {
          shippingType = "ml_flex";
        }

        const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;

        let salesCount = 0;
        const subtitleEl =
          document.querySelector(".ui-pdp-header .ui-pdp-subtitle") ||
          document.querySelector(".ui-pdp-subtitle") ||
          document.querySelector(".ui-pdp-header__subtitle");
        if (subtitleEl && subtitleEl.innerText) {
          const m = subtitleEl.innerText.trim().match(/(\+?\d+(?:[\.,]\d+)?)\s*(mil|k)?\s*vendid/i);
          if (m) {
            let n = parseFloat(m[1].replace("+", "").replace(/\./g, "").replace(",", "."));
            if (m[2] && (m[2].toLowerCase().startsWith("mil") || m[2].toLowerCase() === "k")) n *= 1000;
            if (!isNaN(n) && n >= 0) salesCount = Math.round(n);
          } else {
            salesCount = 0;
          }
        }

        let listingCreatedAt = null;
        let listingType = "gold_special";
        const scripts = document.querySelectorAll("script");
        for (const s of scripts) {
          const c = s.textContent || "";
          const lt = c.match(/"listing_type_id"\s*:\s*"(gold_pro|gold_special)"/i);
          if (lt && lt[1]) listingType = lt[1].toLowerCase();
          if (!listingCreatedAt) {
            const dm =
              c.match(/"startTime"\s*:\s*"([^"]+)"/i) ||
              c.match(/"start_time"\s*:\s*"([^"]+)"/i) ||
              c.match(/"date_created"\s*:\s*"([^"]+)"/i);
            if (dm && dm[1]) {
              const d = new Date(dm[1]);
              if (!isNaN(d.getTime())) {
                listingCreatedAt = d.toISOString();
              }
            }
          }
        }
        const bodyText = document.body?.innerText || "";
        if (listingType === "gold_special") {
          const installEl =
            document.querySelector(".ui-pdp-price__subtitles") ||
            document.querySelector("#pricing_price_subtitle");
          const installText = installEl?.innerText || "";
          if (/sem\s+juros/i.test(installText) && !/cart[ãa]o\s+mercado\s+pago/i.test(installText)) {
            listingType = "gold_pro";
          }
        }
        if (!listingCreatedAt) {
          const relMatch = bodyText.match(/Publicado:?\s*h[áa]\s*(\d+)\s*dias?/i);
          if (relMatch) {
            const days = parseInt(relMatch[1], 10);
            if (!isNaN(days) && days >= 0 && days < 5000) {
              listingCreatedAt = new Date(Date.now() - days * 86400000).toISOString();
            }
          } else {
            const expMatch = bodyText.match(/Publicado\s*(?:em|:)?\s*(\d{2})\/(\d{2})\/(20\d{2})/i);
            if (expMatch) {
              const d = new Date(Date.UTC(parseInt(expMatch[3], 10), parseInt(expMatch[2], 10) - 1, parseInt(expMatch[1], 10), 12, 0, 0));
              if (!isNaN(d.getTime())) listingCreatedAt = d.toISOString();
            }
          }
        }

        let saleFeePct = listingType === "gold_pro" ? 17 : 12;
        const fixedFee =
          price > 0 && price < 12.5 ? price / 2 : price < 29 ? 6.25 : price < 50 ? 6.5 : price < 79 ? 6.75 : 0;
        let saleFeeAmount = price > 0 ? Number(((price * saleFeePct) / 100 + fixedFee).toFixed(2)) : 0;
        let shippingCost = 22.45;
        if (price < 79) shippingCost = 0;
        else if (price < 100) shippingCost = 13.65;
        else if (price < 120) shippingCost = 16.85;
        else if (price < 150) shippingCost = 18.65;
        else if (price < 200) shippingCost = 20.45;

        const domTarifaMatch = bodyText.match(/Tarifa:\s*R\$\s*([\d.,]+)/i);
        const domFreteMatch = bodyText.match(/Frete:\s*R\$\s*([\d.,]+)/i);
        if (domTarifaMatch) {
          const parsedT = parseBrl(domTarifaMatch[1]);
          if (parsedT > 0 && parsedT < price) {
            saleFeeAmount = parsedT;
            saleFeePct = Number(((parsedT / price) * 100).toFixed(1));
          }
        }
        if (domFreteMatch) {
          const parsedF = parseBrl(domFreteMatch[1]);
          if (parsedF >= 0 && parsedF < price) {
            shippingCost = parsedF;
          }
        }

        return {
          title,
          current_price: price,
          original_price: origPrice,
          seller_name: sellerName,
          shipping_type: shippingType,
          thumbnail_url: ogImg,
          sales_count_approx: salesCount,
          listing_created_at: listingCreatedAt,
          listing_type: listingType,
          sale_fee_amount: saleFeeAmount,
          sale_fee_pct: saleFeePct,
          shipping_cost: shippingCost,
        };
      },
    });

    const data = results?.[0]?.result;
    if (data && data.current_price > 0) {
      return {
        ...data,
        permalink: targetUrl,
        external_id: externalId,
      };
    }
  } catch (err) {
    console.warn("[Background] Aviso na inspeção em aba silenciosa:", err);
  } finally {
    if (tabId !== null) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
  return null;
}

async function handleInspectCompetitorLink(payload) {
  const {
    erpUrl: rawErpUrl,
    permalink: rawPermalink,
    external_id,
    platform = "mercadolivre",
    my_listing_id,
    competitor_id,
  } = payload || {};

  const permalink = (rawPermalink || "").replace(
    /produto\.mercadolivre\.com\.br\/MLB(\d+)/i,
    "produto.mercadolivre.com.br/MLB-$1"
  );

  let extracted = null;

  // 0. Verifica se o anúncio já está aberto em alguma aba ativa do navegador para obter os dados ao vivo do content_script
  try {
    const cleanExtDigits = String(external_id || "").replace(/^MLB-?/i, "");
    const cleanPermalinkBase = (permalink || "").split(/[?#]/)[0];
    const openTabs = await chrome.tabs.query({});
    const candidateTabs = openTabs.filter((t) => {
      if (!t.url) return false;
      if (cleanExtDigits && t.url.includes(cleanExtDigits)) return true;
      if (cleanPermalinkBase && t.url.split(/[?#]/)[0] === cleanPermalinkBase) return true;
      return false;
    });

    // Se não achou pela URL direta (ex: link de catálogo /up/MLBU...), consulta abas abertas do Mercado Livre
    const mlTabsToQuery =
      candidateTabs.length > 0
        ? candidateTabs
        : openTabs.filter((t) => t.url && t.url.includes("mercadolivre.com.br"));

    for (const tab of mlTabsToQuery) {
      if (!tab.id) continue;
      const tabRes = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 1500);
        chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_DATA" }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError || !res || !res.data) return resolve(null);
          resolve(res.data);
        });
      });
      if (tabRes && tabRes.current_price > 0) {
        const tabExtDigits = String(tabRes.external_id || "").replace(/^MLB-?/i, "");
        if (
          candidateTabs.includes(tab) ||
          (cleanExtDigits && tabExtDigits === cleanExtDigits)
        ) {
          extracted = tabRes;
          break;
        }
      }
    }
  } catch {}

  // 1. Tenta carregar o HTML da página do anúncio com cookies da sessão do navegador (credentials: "include")
  if (!extracted && permalink) {
    try {
      const res = await fetch(permalink, {
        credentials: "include",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });
      if (res.ok) {
        const html = await res.text();
        extracted = parseHtmlMultilayer(html, permalink, external_id);
      }
    } catch (e) {
      console.warn("[Background] Erro ao buscar HTML do link:", e);
    }

    // 2. Se a página exigiu desafio JS (bot-interceptor-muralla), extrai via aba silenciosa
    if (!extracted || !extracted.current_price) {
      extracted = await extractViaBackgroundTab(permalink, external_id);
    }
  }

  // 3. Envia para o ERP na URL de origem atual (ou retorna verifiedData se falhar envio direto)
  try {
    const { data } = await postToErp(
      "/api/bi/refresh-comparison",
      {
        my_listing_id,
        competitor_id,
        competitor_permalink: permalink,
        competitor_external_id: external_id,
        platform,
        verified_data: extracted,
      },
      { erpUrl: rawErpUrl }
    );
    return { success: true, verifiedData: extracted, ...data };
  } catch {
    return { success: false, verifiedData: extracted };
  }
}

async function handleGetCompetitorFees(req) {
  const config = await getStoredConfig();
  const params = new URLSearchParams();
  if (req.platform) params.set("platform", req.platform);
  if (req.item_id) params.set("item_id", req.item_id);
  if (req.price) params.set("price", String(req.price));
  if (req.listing_type) params.set("listing_type", req.listing_type);
  if (req.category_id) params.set("category_id", req.category_id);
  if (req.breadcrumb) params.set("breadcrumb", req.breadcrumb);
  if (req.title) params.set("title", req.title);
  if (req.weight_grams) params.set("weight_grams", String(req.weight_grams));
  if (req.seller_id) params.set("seller_id", String(req.seller_id));
  if (req.seller_store_url) params.set("seller_store_url", String(req.seller_store_url));
  if (req.seller_name) params.set("seller_name", String(req.seller_name));
  if (req.thumbnail_url) params.set("thumbnail_url", String(req.thumbnail_url));

  const res = await fetch(`${config.erpUrl}/api/extension/fees?${params.toString()}`, {
    headers: authHeaders(config.apiToken),
  });
  if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
  return await res.json();
}

async function fetchHighResBlob(photo) {
  const candidates = [
    photo?.primaryUrl,
    ...(photo?.fallbacks || []),
    photo?.originalUrl || photo?.url || (typeof photo === "string" ? photo : null),
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) continue;
        const blob = await res.blob();
        if (blob && blob.size > 1024) {
          return blob;
        }
      }
    } catch {}
  }
  throw new Error("Não foi possível carregar a imagem em nenhuma das resoluções disponíveis.");
}

async function convertBlobToJpg(blob) {
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;

  let jpgBlob;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    jpgBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 1.0 });
  } else {
    throw new Error("OffscreenCanvas não suportado");
  }

  if (bitmap.close) bitmap.close();
  return jpgBlob;
}

async function blobToDataUrl(blob) {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function handleDownloadSinglePhoto(payload) {
  const { photo, folderName = "Fotos_Anuncio", index = 1, total = 1 } = payload || {};
  const blob = await fetchHighResBlob(photo);
  const jpgBlob = await convertBlobToJpg(blob);
  const dataUrl = await blobToDataUrl(jpgBlob);

  const cleanFolder = (folderName || "Fotos_Anuncio").replace(/[\\/:*?"<>|]/g, "_").trim();
  const indexStr = String(index).padStart(2, "0");
  const filename = `${cleanFolder}/foto_${indexStr}.jpg`;

  if (chrome.downloads && chrome.downloads.download) {
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename,
          saveAs: false,
          conflictAction: "uniquify",
        },
        (id) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(id);
        }
      );
    });
    return { success: true, downloadId, filename };
  } else {
    return { success: true, dataUrl, filename, requiresClientDownload: true };
  }
}

async function handleDownloadPhotos(payload) {
  const { photos, folderName = "Fotos_Anuncio", title = "" } = payload || {};
  if (!Array.isArray(photos) || photos.length === 0) {
    return { success: false, error: "Nenhuma foto fornecida para download." };
  }

  let downloadedCount = 0;
  const errors = [];

  for (let i = 0; i < photos.length; i++) {
    try {
      await handleDownloadSinglePhoto({
        photo: photos[i],
        folderName,
        index: i + 1,
        total: photos.length,
      });
      downloadedCount++;
    } catch (err) {
      console.warn(`[Background] Erro na foto ${i + 1}:`, err);
      errors.push({ index: i + 1, error: err.message });
    }
  }

  return {
    success: downloadedCount > 0,
    downloadedCount,
    total: photos.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Normaliza termo de busca para slug do Mercado Livre
 */
function normalizeMlSearchSlug(query) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Parser estruturado de busca ML a partir de HTML (__PRELOADED_STATE__ JSON + JSON-LD)
 */
function parseMlSearchHtmlStructured(html, maxItems = 50) {
  if (!html || html.length < 1500) return [];
  if (html.includes("/gz/account-verification")) return [];

  const items = [];
  const seen = new Set();

  // 1. __PRELOADED_STATE__ JSON
  try {
    const stateMatch =
      html.match(/<script[^>]*id=["']__PRELOADED_STATE__["'][^>]*>([\s\S]*?)<\/script>/i) ||
      html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);

    if (stateMatch && stateMatch[1]) {
      const parsed = JSON.parse(stateMatch[1].trim());
      const results =
        parsed?.pageState?.initialState?.results ||
        parsed?.initialState?.results ||
        parsed?.results ||
        [];

      if (Array.isArray(results)) {
        for (const r of results) {
          if (items.length >= maxItems) break;
          const poly = r?.polycard || r;
          const meta = poly?.metadata || {};
          const components = Array.isArray(poly?.components) ? poly.components : [];

          const externalId = String(meta.id || r.id || "").trim();
          if (!externalId || seen.has(externalId)) continue;

          const titleComp = components.find((c) => c.type === "title");
          const priceComp = components.find((c) => c.type === "price");
          const shippingComp = components.find((c) => c.type === "shipping");
          const sellerComp = components.find((c) => c.type === "seller");
          const reviewsComp = components.find((c) => c.type === "reviews");

          const title = String(titleComp?.title?.text || r.title || "").trim();
          const price = Number(priceComp?.price?.current_price?.value ?? r.price ?? 0);
          if (!title || !price || isNaN(price)) continue;

          seen.add(externalId);

          const prevRaw = priceComp?.price?.previous_price?.value
            ? Number(priceComp.price.previous_price.value)
            : null;
          const originalPrice = prevRaw && prevRaw > price ? prevRaw : null;
          const discountPct = priceComp?.price?.discount?.value
            ? Number(priceComp.price.discount.value)
            : originalPrice
            ? Math.round(((originalPrice - price) / originalPrice) * 100)
            : null;

          const shipText = String(shippingComp?.shipping?.text || "").toLowerCase();
          const isFull =
            shippingComp?.shipping?.promise_type === "same_day" ||
            shipText.includes("full") ||
            JSON.stringify(shippingComp || {}).toLowerCase().includes("poly_full");
          const isFree = shipText.includes("grátis") || shipText.includes("gratis");

          const rawUrl = String(meta.url || r.permalink || "");
          const permalink = rawUrl
            ? rawUrl.startsWith("http")
              ? rawUrl
              : `https://${rawUrl.replace(/^\/+/, "")}`
            : `https://produto.mercadolivre.com.br/MLB-${externalId.replace(/^MLB-?/i, "")}`;

          const picId = poly?.pictures?.pictures?.[0]?.id;
          const thumbnail = picId
            ? `https://http2.mlstatic.com/D_NQ_NP_${picId}-V.webp`
            : r.thumbnail || null;

          const sellerText = String(sellerComp?.seller?.text || "")
            .replace(/^Por\s+/i, "")
            .replace(/\{icon_cockade\}/g, "")
            .trim();

          items.push({
            id: externalId,
            platform: "mercadolivre",
            external_id: externalId,
            title,
            current_price: Number(price.toFixed(2)),
            original_price: originalPrice ? Number(originalPrice.toFixed(2)) : null,
            discount_pct: discountPct,
            shipping_type: isFull ? "ml_full" : isFree ? "ml_correios" : "padrao",
            is_free_shipping: isFree,
            is_full_or_flex: isFull,
            promo_badge: discountPct ? `${discountPct}% OFF` : isFull ? "FULL" : null,
            campaign_type: discountPct ? "Campanha Mercado Livre" : isFull ? "Full" : null,
            listing_type: isFull ? "gold_pro" : "gold_special",
            permalink: permalink.split("#")[0],
            thumbnail_url: thumbnail,
            seller_name: sellerText || "Vendedor Mercado Livre",
            seller_reputation: sellerText ? "platinum" : null,
            sales_count_approx: 0,
            rating: Number(reviewsComp?.reviews?.rating_average || 4.8) || 4.8,
            reviews_count: Number(reviewsComp?.reviews?.total || 0) || 0,
            is_already_monitored: false,
            matched_my_listing_id: null,
          });
        }
      }
    }
  } catch (e) {
    console.warn("[Background] Falha parser __PRELOADED_STATE__:", e);
  }

  return items;
}

/**
 * Fallback via aba silenciosa em background (executa JS real + scroll rápido para carregar todos os cards)
 */
async function extractSearchViaBackgroundTab(searchUrl, platform = "mercadolivre", maxItems = 50) {
  let tabId = null;
  try {
    const createdTab = await chrome.tabs.create({ url: searchUrl, active: false });
    tabId = createdTab.id;

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 6500);
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          setTimeout(() => {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 1200);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [platform, maxItems],
      func: async (plat, limit) => {
        // Scroll rápido para hidratar lazy-load de imagens e cards
        try {
          window.scrollTo(0, 900);
          await new Promise((r) => setTimeout(r, 350));
          window.scrollTo(0, 1800);
          await new Promise((r) => setTimeout(r, 350));
        } catch {}

        const items = [];
        const seen = new Set();

        if (plat === "mercadolivre") {
          // 1. Tenta __PRELOADED_STATE__ no DOM primeiro
          try {
            const stateEl = document.getElementById("__PRELOADED_STATE__");
            const rawState = stateEl ? JSON.parse(stateEl.textContent || "{}") : window.__PRELOADED_STATE__;
            const resList = rawState?.pageState?.initialState?.results || rawState?.initialState?.results || [];
            if (Array.isArray(resList) && resList.length > 0) {
              for (const r of resList) {
                if (items.length >= limit) break;
                const poly = r?.polycard || r;
                const meta = poly?.metadata || {};
                const comps = Array.isArray(poly?.components) ? poly.components : [];
                const extId = String(meta.id || r.id || "").trim();
                if (!extId || seen.has(extId)) continue;
                const titleComp = comps.find((c) => c.type === "title");
                const priceComp = comps.find((c) => c.type === "price");
                const shipComp = comps.find((c) => c.type === "shipping");
                const sellerComp = comps.find((c) => c.type === "seller");
                const revComp = comps.find((c) => c.type === "reviews");
                const title = String(titleComp?.title?.text || r.title || "").trim();
                const price = Number(priceComp?.price?.current_price?.value ?? r.price ?? 0);
                if (!title || !price) continue;
                seen.add(extId);
                const prevRaw = priceComp?.price?.previous_price?.value ? Number(priceComp.price.previous_price.value) : null;
                const orig = prevRaw && prevRaw > price ? prevRaw : null;
                const disc = priceComp?.price?.discount?.value
                  ? Number(priceComp.price.discount.value)
                  : orig
                  ? Math.round(((orig - price) / orig) * 100)
                  : null;
                const shipTxt = String(shipComp?.shipping?.text || "").toLowerCase();
                const isFull = shipTxt.includes("full") || JSON.stringify(shipComp || {}).toLowerCase().includes("poly_full");
                const isFree = shipTxt.includes("grátis") || shipTxt.includes("gratis");
                const rawUrl = String(meta.url || r.permalink || "");
                const permalink = rawUrl
                  ? rawUrl.startsWith("http")
                    ? rawUrl
                    : `https://${rawUrl.replace(/^\/+/, "")}`
                  : `https://produto.mercadolivre.com.br/MLB-${extId.replace(/^MLB-?/i, "")}`;
                const picId = poly?.pictures?.pictures?.[0]?.id;
                const thumb = picId ? `https://http2.mlstatic.com/D_NQ_NP_${picId}-V.webp` : null;
                const seller = String(sellerComp?.seller?.text || "").replace(/^Por\s+/i, "").replace(/\{icon_cockade\}/g, "").trim();

                items.push({
                  id: extId,
                  platform: "mercadolivre",
                  external_id: extId,
                  title,
                  current_price: Number(price.toFixed(2)),
                  original_price: orig ? Number(orig.toFixed(2)) : null,
                  discount_pct: disc,
                  shipping_type: isFull ? "ml_full" : isFree ? "ml_correios" : "padrao",
                  is_free_shipping: isFree,
                  is_full_or_flex: isFull,
                  promo_badge: disc ? `${disc}% OFF` : isFull ? "FULL" : null,
                  campaign_type: disc ? "Campanha ML" : isFull ? "Full" : null,
                  listing_type: isFull ? "gold_pro" : "gold_special",
                  permalink: permalink.split("#")[0],
                  thumbnail_url: thumb,
                  seller_name: seller || "Vendedor Mercado Livre",
                  seller_reputation: seller ? "platinum" : null,
                  sales_count_approx: 0,
                  rating: Number(revComp?.reviews?.rating_average || 4.8) || 4.8,
                  reviews_count: Number(revComp?.reviews?.total || 0) || 0,
                  is_already_monitored: false,
                  matched_my_listing_id: null,
                });
              }
            }
          } catch {}

          // 2. Complemento via DOM poly-card / ui-search-layout__item
          if (items.length < 5) {
            const cards = Array.from(document.querySelectorAll("div.poly-card, li.ui-search-layout__item"));
            for (const el of cards) {
              if (items.length >= limit) break;
              const titleEl = el.querySelector("a.poly-component__title, .poly-component__title a, h2 a, a.ui-search-link");
              const title = titleEl?.innerText?.trim();
              const rawHref = titleEl?.getAttribute("href") || titleEl?.href || "";
              if (!title || !rawHref) continue;

              const fracEl = el.querySelector(".poly-price__current .andes-money-amount__fraction, .andes-money-amount__fraction");
              const centsEl = el.querySelector(".poly-price__current .andes-money-amount__cents, .andes-money-amount__cents");
              const frac = fracEl ? parseFloat(fracEl.innerText.replace(/\./g, "").trim()) : 0;
              const cents = centsEl ? parseFloat(centsEl.innerText.trim()) / 100 : 0;
              const price = frac + cents;
              if (!price || isNaN(price)) continue;

              const permalink = rawHref.split("#")[0];
              const idMatch = permalink.match(/(MLB-?\d+)/i) || el.innerHTML.match(/wid=(MLB\d+)/i);
              const extId = idMatch ? idMatch[1].replace("-", "").toUpperCase() : `MLB_${items.length}_${Date.now()}`;
              if (seen.has(extId)) continue;
              seen.add(extId);

              const imgEl = el.querySelector("img");
              let thumb = imgEl?.getAttribute("data-src") || imgEl?.src || null;
              if (thumb && thumb.startsWith("data:")) thumb = null;

              const sellerEl = el.querySelector(".poly-component__seller");
              const seller = sellerEl ? sellerEl.innerText.replace(/^Por\s+/i, "").trim() : "Vendedor Mercado Livre";
              const isFull = /full/i.test(el.innerHTML);
              const isFree = /frete gr[áa]tis|chegar[áa] gr[áa]tis/i.test(el.innerText);

              items.push({
                id: extId,
                platform: "mercadolivre",
                external_id: extId,
                title,
                current_price: Number(price.toFixed(2)),
                original_price: null,
                discount_pct: null,
                shipping_type: isFull ? "ml_full" : isFree ? "ml_correios" : "padrao",
                is_free_shipping: isFree,
                is_full_or_flex: isFull,
                promo_badge: isFull ? "FULL" : null,
                campaign_type: isFull ? "Full" : null,
                listing_type: isFull ? "gold_pro" : "gold_special",
                permalink,
                thumbnail_url: thumb,
                seller_name: seller,
                seller_reputation: null,
                sales_count_approx: 0,
                rating: 4.8,
                reviews_count: 0,
                is_already_monitored: false,
                matched_my_listing_id: null,
              });
            }
          }
        } else if (plat === "shopee") {
          const cards = Array.from(document.querySelectorAll('div[data-sqe="item"], div.shopee-search-item-result__item, a[data-sqe="link"]'));
          for (let i = 0; i < cards.length && items.length < limit; i++) {
            const el = cards[i];
            const linkEl = el.tagName === "A" ? el : el.querySelector("a");
            const rawHref = linkEl?.getAttribute("href") || "";
            if (!rawHref) continue;
            const imgEl = el.querySelector("img");
            const titleEl = el.querySelector('div[data-sqe="name"], [class*="line-clamp"]') || imgEl;
            const title = (titleEl?.innerText || titleEl?.alt || "").trim();
            const priceMatch = (el.innerText || "").match(/R\$\s*([\d.,]+)/i);
            const price = priceMatch
              ? parseFloat(priceMatch[1].replace(/\./g, "").replace(",", "."))
              : 0;
            if (!title || !price) continue;
            const extId = `SHP_${Date.now()}_${i}`;
            items.push({
              id: extId,
              platform: "shopee",
              external_id: extId,
              title,
              current_price: Number(price.toFixed(2)),
              original_price: null,
              discount_pct: null,
              shipping_type: "shopee_xpress",
              is_free_shipping: true,
              is_full_or_flex: true,
              promo_badge: "Shopee",
              campaign_type: null,
              listing_type: "oficial",
              permalink: rawHref.startsWith("http") ? rawHref : `https://shopee.com.br${rawHref}`,
              thumbnail_url: imgEl?.src || null,
              seller_name: "Vendedor Shopee",
              seller_reputation: "indicado",
              sales_count_approx: 0,
              rating: 4.8,
              reviews_count: 0,
              is_already_monitored: false,
              matched_my_listing_id: null,
            });
          }
        }

        return items;
      },
    });

    return Array.isArray(results?.[0]?.result) ? results[0].result : [];
  } catch (err) {
    console.warn("[Background] Erro na busca em aba silenciosa:", err);
    return [];
  } finally {
    if (tabId !== null) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

/**
 * Busca de Mercado Silenciosa via Extensão (sessão humana real do navegador -> bulk-sync ERP)
 */
async function handleSearchMarketplaceBackground(payload) {
  const {
    query = "",
    platform = "mercadolivre",
    limit = 40,
    erpUrl: rawErpUrl,
  } = payload || {};

  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    return { success: false, error: "Termo de busca vazio." };
  }

  const targetPlatform = platform === "shopee" ? "shopee" : "mercadolivre";
  const maxItems = Math.min(60, Math.max(15, Number(limit) || 40));
  const searchUrl =
    targetPlatform === "shopee"
      ? `https://shopee.com.br/search?keyword=${encodeURIComponent(cleanQuery)}`
      : `https://lista.mercadolivre.com.br/${encodeURIComponent(normalizeMlSearchSlug(cleanQuery))}`;

  let items = [];

  // 1. Tentativa ultrarrápida (~800ms): fetch com cookies humanos + parser __PRELOADED_STATE__
  if (targetPlatform === "mercadolivre") {
    try {
      const res = await fetch(searchUrl, {
        credentials: "include",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });
      if (res.ok) {
        const html = await res.text();
        items = parseMlSearchHtmlStructured(html, maxItems);
      }
    } catch (err) {
      console.warn("[Background] Fetch direto busca ML falhou, tentando aba silenciosa:", err);
    }
  }

  // 2. Fallback automático: aba silenciosa em background (executa JS real + scroll)
  if (items.length === 0) {
    items = await extractSearchViaBackgroundTab(searchUrl, targetPlatform, maxItems);
  }

  if (items.length === 0) {
    return {
      success: false,
      count: 0,
      items: [],
      error: "Não foi possível extrair anúncios automaticamente. Tente abrir a busca no navegador.",
    };
  }

  // 3. Persiste no ERP (bulk-sync -> Supabase snapshot 6h + memória)
  try {
    await postToErp(
      "/api/bi/market-search/bulk-sync",
      {
        query: cleanQuery,
        platform: targetPlatform,
        items,
      },
      { erpUrl: rawErpUrl }
    );
  } catch (syncErr) {
    console.warn("[Background] Aviso ao sincronizar busca com ERP:", syncErr);
  }

  return {
    success: true,
    count: items.length,
    query: cleanQuery,
    platform: targetPlatform,
    items,
  };
}

const handlers = {
  ERP_SESSION: (req) => handleErpSession(req),
  SYNC_COMPETITOR: (req) => handleSyncCompetitor(req.payload),
  SYNC_SEARCH_ITEMS: (req) => handleSyncSearchItems(req.erpUrl, req.payload),
  SEARCH_MARKETPLACE_BACKGROUND: (req) => handleSearchMarketplaceBackground(req.payload),
  SYNC_STORE_ITEMS: (req) => handleSyncStoreItems(req.erpUrl, req.payload),
  SAVE_OPPORTUNITY_LISTING: (req) => handleSaveOpportunityListing(req.erpUrl, req.payload),
  GET_MY_LISTINGS: (req) => handleGetMyListings(req.platform, req.query),
  GET_COMPETITOR_FEES: (req) => handleGetCompetitorFees(req),
  INSPECT_COMPETITOR_LINK: (req) => handleInspectCompetitorLink(req.payload),
  DOWNLOAD_SINGLE_PHOTO: (req) => handleDownloadSinglePhoto(req.payload),
  DOWNLOAD_PHOTOS: (req) => handleDownloadPhotos(req.payload),
  FETCH_PAGE_HTML: async (req) => {
    try {
      const resp = await fetch(req.url, {
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Upgrade-Insecure-Requests": "1"
        },
        credentials: "include"
      });
      if (!resp.ok) return { success: false, status: resp.status };
      const html = await resp.text();
      return { success: true, html };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
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
