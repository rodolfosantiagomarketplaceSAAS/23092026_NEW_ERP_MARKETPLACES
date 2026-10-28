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
        const scripts = document.querySelectorAll("script");
        for (const s of scripts) {
          const c = s.textContent || "";
          const dm =
            c.match(/"startTime"\s*:\s*"([^"]+)"/i) ||
            c.match(/"start_time"\s*:\s*"([^"]+)"/i) ||
            c.match(/"date_created"\s*:\s*"([^"]+)"/i);
          if (dm && dm[1]) {
            const d = new Date(dm[1]);
            if (!isNaN(d.getTime())) {
              listingCreatedAt = d.toISOString();
              break;
            }
          }
        }
        if (!listingCreatedAt) {
          const bodyText = document.body?.innerText || "";
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

        return {
          title,
          current_price: price,
          original_price: origPrice,
          seller_name: sellerName,
          shipping_type: shippingType,
          thumbnail_url: ogImg,
          sales_count_approx: salesCount,
          listing_created_at: listingCreatedAt,
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
    const openTabs = await chrome.tabs.query({});
    const matchingTab = openTabs.find((t) => {
      if (!t.url) return false;
      if (cleanExtDigits && t.url.includes(cleanExtDigits)) return true;
      if (permalink && t.url.split("?")[0] === permalink.split("?")[0]) return true;
      return false;
    });
    if (matchingTab && matchingTab.id) {
      const tabRes = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 2000);
        chrome.tabs.sendMessage(matchingTab.id, { action: "GET_PAGE_DATA" }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError || !res || !res.data) return resolve(null);
          resolve(res.data);
        });
      });
      if (tabRes && tabRes.current_price > 0) {
        extracted = tabRes;
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

  const res = await fetch(`${config.erpUrl}/api/extension/fees?${params.toString()}`, {
    headers: authHeaders(config.apiToken),
  });
  if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
  return await res.json();
}

const handlers = {
  ERP_SESSION: (req) => handleErpSession(req),
  SYNC_COMPETITOR: (req) => handleSyncCompetitor(req.payload),
  SYNC_SEARCH_ITEMS: (req) => handleSyncSearchItems(req.erpUrl, req.payload),
  GET_MY_LISTINGS: (req) => handleGetMyListings(req.platform, req.query),
  GET_COMPETITOR_FEES: (req) => handleGetCompetitorFees(req),
  INSPECT_COMPETITOR_LINK: (req) => handleInspectCompetitorLink(req.payload),
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
