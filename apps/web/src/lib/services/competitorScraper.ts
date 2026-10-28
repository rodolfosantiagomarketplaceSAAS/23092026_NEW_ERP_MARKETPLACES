import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getActiveMarketplaceToken } from "@/lib/services/marketplaceIntegrations";
import { decryptSecret } from "@/lib/security/crypto";

export interface VerifiedCompetitorData {
  title: string;
  current_price: number;
  original_price: number | null;
  seller_name: string;
  seller_reputation: string;
  shipping_type: string;
  promo_badge: string | null;
  thumbnail_url: string | null;
  sales_count_approx: number;
  listing_created_at?: string | null;
  permalink: string;
  external_id: string;
  source?: "extension" | "ml_api" | "html_scraper" | "database_verified";
}

/**
 * Normaliza strings de preço (Ex: "R$ 1.246,28" -> 1246.28 ou 146.28 -> 146.28)
 */
export function parsePrice(val: unknown): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const raw = String(val).trim();
  // Se já estiver em formato float padrão (ex: "146.28")
  if (/^\d+(\.\d{1,2})?$/.test(raw)) {
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
  }
  const str = raw
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Limpa nome do vendedor removendo prefixos duplicados como "Vendido por "
 */
export function cleanSellerName(raw?: string | null): string {
  if (!raw) return "Concorrente";
  const cleaned = String(raw)
    .replace(/^(Vendido\s+por|Loja:?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Concorrente";
}

/**
 * Limpa selos promocionais removendo textos de parcelamento (ex: "4x R$ 35,36 sem juros") e quebras de linha
 */
export function cleanPromoBadge(
  raw?: string | null,
  currentPrice?: number,
  originalPrice?: number | null
): string | null {
  let badge: string | null = null;
  if (raw) {
    const singleLine = String(raw).replace(/\s+/g, " ").trim();
    const isInstallmentNoise =
      /^\d+x\s*R\$/i.test(singleLine) ||
      /sem\s+juros/i.test(singleLine) ||
      /^em\s+\d+x/i.test(singleLine);

    if (!isInstallmentNoise && singleLine.length > 0) {
      if (/PRE[CÇ]O\s+BAIXOU/i.test(singleLine)) {
        badge = "PREÇO BAIXOU";
      } else {
        badge = singleLine.slice(0, 40);
      }
    }
  }

  if (
    !badge &&
    currentPrice &&
    originalPrice &&
    originalPrice > currentPrice
  ) {
    const offPct = Math.round(
      ((originalPrice - currentPrice) / originalPrice) * 100
    );
    if (offPct > 0 && offPct < 95) {
      badge = `${offPct}% OFF`;
    }
  }

  return badge;
}

/**
 * Extrai o ID MLB do Mercado Livre (ex: MLB5302227582), ignorando MLBU
 */
export function extractMlbId(rawIdOrUrl?: string | null): string | null {
  if (!rawIdOrUrl) return null;
  const match = rawIdOrUrl.match(/MLB(?!U)-?(\d{7,14})/i);
  if (match) return `MLB${match[1]}`;
  return null;
}

/**
 * Extrai o ID MLBU (User Product do Mercado Livre, ex: MLBU3044670840)
 */
export function extractMlbuId(rawIdOrUrl?: string | null): string | null {
  if (!rawIdOrUrl) return null;
  const match = rawIdOrUrl.match(/MLBU-?(\d{7,14})/i);
  if (match) return `MLBU${match[1]}`;
  return null;
}

/**
 * Normaliza URLs do Mercado Livre garantindo hífen em produto.mercadolivre.com.br/MLB-XXXX
 */
export function normalizeCompetitorPermalink(
  permalink?: string | null,
  externalId?: string | null,
  platform = "mercadolivre"
): string {
  let url = (permalink || "").trim();
  if (url) {
    if (url.startsWith("//")) url = `https:${url}`;
    else if (url.startsWith("http://")) url = url.replace("http://", "https://");
    else if (!url.startsWith("https://")) url = `https://${url}`;

    // Corrige produto.mercadolivre.com.br/MLB123456 -> produto.mercadolivre.com.br/MLB-123456
    url = url.replace(
      /produto\.mercadolivre\.com\.br\/MLB(\d+)/i,
      "produto.mercadolivre.com.br/MLB-$1"
    );
    return url;
  }

  if (platform === "mercadolivre" && externalId) {
    const mlbu = extractMlbuId(externalId);
    if (mlbu) {
      return `https://www.mercadolivre.com.br/up/${mlbu}`;
    }
    const mlb = extractMlbId(externalId);
    if (mlb) {
      const digits = mlb.replace(/^MLB-?/i, "");
      return `https://produto.mercadolivre.com.br/MLB-${digits}`;
    }
  }

  return "";
}

/**
 * Tabelas de calibração cronológica Dual-Shard de IDs do Mercado Livre Brasil (MLB)
 */
const ODD_MLB_ANCHORS: [number, number][] = [
  [1000000001, 1520000000],
  [2000000001, 1630000000],
  [3000000001, 1672531200],
  [3500000001, 1717200000],
  [4000000001, 1747267200],
  [4473157969, 1770897600],
  [4680140101, 1778774182],
  [4729260091, 1780401600],
  [4907118005, 1784289600],
  [4949688649, 1785118614],
  [5007001935, 1786033623],
  [5049362965, 1786580776],
  [5102291473, 1787268007],
  [5147833041, 1787875766],
  [5180213341, 1788400367],
  [5215384915, 1789056122],
  [5261622325, 1789846455],
  [5309734189, 1790683356],
  [5342125297, 1791301373],
  [5371657083, 1791737346],
  [5390836089, 1791980576],
  [5392217295, 1791993935],
  [5425017267, 1792428203],
  [5451861735, 1792759331],
  [5467689883, 1793060428],
];

const EVEN_MLB_ANCHORS: [number, number][] = [
  [4000000000, 1747267200],
  [5302227582, 1775736000],
  [6776418892, 1778775181],
  [7071688620, 1782907200],
  [7136348316, 1783638496],
  [7259550226, 1785118538],
  [7349483204, 1786059234],
  [7400693466, 1786581179],
  [7472416462, 1787271960],
  [7536360518, 1787876196],
  [7585061812, 1788450863],
  [7619525010, 1789056362],
  [7669930830, 1789847705],
  [7721699724, 1790681669],
  [7757951996, 1791302312],
  [7790395684, 1791740343],
  [7819244990, 1792079149],
  [7846016296, 1792426830],
  [7862839620, 1792636014],
  [7891206434, 1793059319],
];

/**
 * Estima a data real de criação de um anúncio do Mercado Livre via:
 * 1) JSON no HTML (startTime / date_created)
 * 2) Interpolação Dual-Shard do ID MLB (Ímpar / Par)
 * 3) Sufixo _MMYYYY da URL da foto no mlstatic.com
 */
export function estimateMlCreationDate(
  externalIdOrUrl?: string | null,
  thumbnailUrl?: string | null,
  html?: string | null
): string | null {
  if (html) {
    const jsonDateMatch =
      html.match(/"startTime"\s*:\s*"([^"]+)"/i) ||
      html.match(/"start_time"\s*:\s*"([^"]+)"/i) ||
      html.match(/"date_created"\s*:\s*"([^"]+)"/i);
    if (jsonDateMatch?.[1]) {
      const d = new Date(jsonDateMatch[1]);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  const m = String(externalIdOrUrl || "").match(/MLB(?!U)-?(\d{8,12})/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && num >= 500000000) {
      const anchors =
        num % 2 === 0 && num >= 4000000000 ? EVEN_MLB_ANCHORS : ODD_MLB_ANCHORS;
      let sec = 0;

      if (num <= anchors[0][0]) {
        const [x0, y0] = anchors[0];
        const [x1, y1] = anchors[1];
        sec = y0 - ((x0 - num) / (x1 - x0)) * (y1 - y0);
      } else if (num >= anchors[anchors.length - 1][0]) {
        const [x0, y0] = anchors[anchors.length - 2];
        const [x1, y1] = anchors[anchors.length - 1];
        sec = y1 + ((num - x1) / (x1 - x0)) * (y1 - y0);
      } else {
        for (let i = 0; i < anchors.length - 1; i++) {
          const [x0, y0] = anchors[i];
          const [x1, y1] = anchors[i + 1];
          if (num >= x0 && num <= x1) {
            sec = y0 + ((num - x0) / (x1 - x0)) * (y1 - y0);
            break;
          }
        }
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const clamped = Math.min(Math.round(sec), nowSec);
      if (clamped > 1200000000) {
        return new Date(clamped * 1000).toISOString();
      }
    }
  }

  if (thumbnailUrl) {
    const imgDateMatch = String(thumbnailUrl).match(/_(\d{2})(20\d{2})-/);
    if (imgDateMatch) {
      const month = parseInt(imgDateMatch[1], 10);
      const year = parseInt(imgDateMatch[2], 10);
      if (month >= 1 && month <= 12 && year >= 2015 && year <= 2030) {
        const d = new Date(Date.UTC(year, month - 1, 14, 12, 0, 0));
        const clampedMs = Math.min(d.getTime(), Date.now());
        return new Date(clampedMs).toISOString();
      }
    }
  }

  return null;
}

/**
 * Refina a data de criação consultando o header Last-Modified da imagem no http2.mlstatic.com
 */
export async function refineMlCreationDateFromImage(
  externalIdOrUrl?: string | null,
  thumbnailUrl?: string | null,
  html?: string | null
): Promise<string | null> {
  const baseEst = estimateMlCreationDate(externalIdOrUrl, thumbnailUrl, html);
  if (!thumbnailUrl || !thumbnailUrl.includes("mlstatic.com")) {
    return baseEst;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(thumbnailUrl.replace(/^http:\/\//i, "https://"), {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);

    const lastMod = res?.headers?.get("last-modified");
    if (lastMod) {
      const imgDate = new Date(lastMod);
      if (!isNaN(imgDate.getTime())) {
        if (!baseEst) return imgDate.toISOString();
        const estDate = new Date(baseEst);
        const diffDays = Math.abs(imgDate.getTime() - estDate.getTime()) / 86400000;
        if (imgDate.getTime() < estDate.getTime() || diffDays <= 14) {
          return imgDate.toISOString();
        }
      }
    }
  } catch {
    // mantém baseEst
  }
  return baseEst;
}

/**
 * Busca recursivamente um objeto Schema.org Product dentro de JSON-LD (incluindo @graph e arrays)
 */
function findProductInJsonLd(obj: any): any {
  if (!obj || typeof obj !== "object") return null;
  if (
    obj["@type"] === "Product" ||
    (Array.isArray(obj["@type"]) && obj["@type"].includes("Product"))
  ) {
    return obj;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findProductInJsonLd(item);
      if (found) return found;
    }
  }
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const found = findProductInJsonLd(item);
      if (found) return found;
    }
  }
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      const found = findProductInJsonLd(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Extrator Multicamada (5 Camadas) de HTML de página de produto (Mercado Livre & Shopee)
 */
export function parseCompetitorHtml(
  html: string,
  permalink?: string
): Partial<VerifiedCompetitorData> {
  const result: Partial<VerifiedCompetitorData> = {};
  if (!html || html.length < 200) return result;

  const isAuthWall =
    html.includes("/gz/account-verification") ||
    html.includes("account-verification");
  if (isAuthWall) return result;

  const isPowChallenge =
    html.includes("bot-interceptor-muralla") ||
    html.includes("micro-landing-container");

  // 1. Camada JSON-LD (todos os blocos <script type="application/ld+json">)
  const ldRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(ldMatch[1].trim());
      const product = findProductInJsonLd(parsed);
      if (product) {
        if (product.name && !result.title) {
          result.title = String(product.name).trim();
        }
        const offers = Array.isArray(product.offers)
          ? product.offers[0]
          : product.offers;
        const p = parsePrice(offers?.price || offers?.lowPrice);
        if (p > 0 && !result.current_price) {
          result.current_price = p;
        }
        const highP = parsePrice(offers?.highPrice);
        if (highP > p && !result.original_price) {
          result.original_price = highP;
        }
        if (offers?.seller?.name && !result.seller_name) {
          result.seller_name = cleanSellerName(offers.seller.name);
        }
        const img = Array.isArray(product.image)
          ? product.image[0]
          : product.image;
        if (typeof img === "string" && img.startsWith("http") && !result.thumbnail_url) {
          result.thumbnail_url = img.replace("http://", "https://");
        }
        if (product.sku && !result.external_id) {
          result.external_id = String(product.sku);
        }
      }
    } catch {
      // ignora bloco inválido
    }
  }

  // 2. Camada Meta Tags (OpenGraph, Twitter Cards e Schema Microdata)
  const extractMeta = (attrName: string, attrVal: string): string | null => {
    const r1 = new RegExp(
      `<meta[^>]*${attrName}=["']${attrVal}["'][^>]*content=["']([^"']+)["']`,
      "i"
    );
    const r2 = new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${attrVal}["']`,
      "i"
    );
    return html.match(r1)?.[1] || html.match(r2)?.[1] || null;
  };

  if (!result.current_price) {
    const metaPrice =
      extractMeta("itemprop", "price") ||
      extractMeta("property", "og:price:amount") ||
      extractMeta("property", "product:price:amount");
    if (metaPrice) {
      const p = parsePrice(metaPrice);
      if (p > 0) result.current_price = p;
    }
  }

  if (!result.title) {
    const ogTitle =
      extractMeta("property", "og:title") ||
      extractMeta("name", "twitter:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (ogTitle) {
      const cleanT = ogTitle
        .replace(/\s*\|\s*Mercado\s*Livre.*$/i, "")
        .replace(/\s*-\s*R\$\s*[\d.,]+.*$/i, "")
        .replace(/&amp;/g, "&")
        .trim();
      if (cleanT && !cleanT.toLowerCase().includes("mercado livre")) {
        result.title = cleanT;
      }
    }
  }

  if (!result.thumbnail_url) {
    const metaImg =
      extractMeta("property", "og:image") ||
      extractMeta("name", "twitter:image");
    if (
      metaImg &&
      metaImg.startsWith("http") &&
      !metaImg.includes("pt_logo_large_plus")
    ) {
      result.thumbnail_url = metaImg.replace("http://", "https://");
    }
  }

  // Se for apenas a página de desafio PoW (micro-landing), retorna os metadados seguros extraídos
  if (isPowChallenge && !html.includes("andes-money-amount")) {
    return result;
  }

  // 3. Camada DOM HTML (Andes Money Amount & Classes de PDP do Mercado Livre)
  if (!result.current_price) {
    const secondLineMatch = html.match(
      /class=["'][^"']*ui-pdp-price__second-line[^"']*["'][\s\S]{0,1500}?class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([\d.]+)<\/span>(?:[\s\S]{0,400}?class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>(\d{1,2})<\/span>)?/i
    );
    if (secondLineMatch) {
      const frac = secondLineMatch[1].replace(/\./g, "");
      const cents = secondLineMatch[2] || "00";
      const p = parseFloat(`${frac}.${cents}`);
      if (!isNaN(p) && p > 0) result.current_price = p;
    }
  }

  if (!result.original_price) {
    const origMatch = html.match(
      /class=["'][^"']*(?:ui-pdp-price__original-value|andes-money-amount--previous)[^"']*["'][\s\S]{0,1200}?class=["'][^"']*andes-money-amount__fraction[^"']*["'][^>]*>([\d.]+)<\/span>(?:[\s\S]{0,400}?class=["'][^"']*andes-money-amount__cents[^"']*["'][^>]*>(\d{1,2})<\/span>)?/i
    );
    if (origMatch) {
      const frac = origMatch[1].replace(/\./g, "");
      const cents = origMatch[2] || "00";
      const p = parseFloat(`${frac}.${cents}`);
      if (!isNaN(p) && p > 0) result.original_price = p;
    }
  }

  // 4. Camada JSON Embutido (__PRELOADED_STATE__ / inline state)
  if (!result.current_price) {
    const statePriceMatch =
      html.match(/"sale_price"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/i) ||
      html.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/i) ||
      html.match(/"price"\s*:\s*([\d.]+)\s*,\s*"currency_id"\s*:\s*"BRL"/i);
    if (statePriceMatch) {
      const p = parseFloat(statePriceMatch[1]);
      if (!isNaN(p) && p > 0) result.current_price = p;
    }
  }

  if (!result.original_price) {
    const stateOrigMatch =
      html.match(/"regular_amount"\s*:\s*([\d.]+)/i) ||
      html.match(/"original_price"\s*:\s*([\d.]+)/i);
    if (stateOrigMatch) {
      const p = parseFloat(stateOrigMatch[1]);
      if (!isNaN(p) && p > (result.current_price || 0)) {
        result.original_price = p;
      }
    }
  }

  // Vendas estimadas (restrito ao ui-pdp-subtitle do anúncio principal para nunca capturar vendas da loja do vendedor)
  const pdpSubtitleMatch = html.match(
    /class=["'][^"']*ui-pdp-subtitle[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
  );
  if (pdpSubtitleMatch) {
    const subText = pdpSubtitleMatch[1].replace(/<[^>]+>/g, " ").trim();
    const subtitleSoldMatch = subText.match(
      /(\+?\d+(?:[.,]\d+)?)\s*(mil|k)?\s*vendid/i
    );
    if (subtitleSoldMatch) {
      let num = parseFloat(
        subtitleSoldMatch[1].replace("+", "").replace(/\./g, "").replace(",", ".")
      );
      if (
        subtitleSoldMatch[2] &&
        (subtitleSoldMatch[2].toLowerCase().startsWith("mil") ||
          subtitleSoldMatch[2].toLowerCase() === "k")
      ) {
        num *= 1000;
      }
      if (!isNaN(num) && num >= 0) result.sales_count_approx = Math.round(num);
    } else if (/novo|usado|recondicionado/i.test(subText)) {
      result.sales_count_approx = 0;
    }
  }

  // Logística
  if (
    html.includes("Enviado pelo FULL") ||
    html.includes("ui-pdp-icon--full") ||
    html.includes("ui-pdp-media--full") ||
    /"logistic_type"\s*:\s*"fulfillment"/i.test(html)
  ) {
    result.shipping_type = "ml_full";
  } else if (
    html.includes("Chegará hoje") ||
    html.includes("ui-pdp-icon--flex") ||
    /"logistic_type"\s*:\s*"self_service"/i.test(html)
  ) {
    result.shipping_type = "ml_flex";
  }

  // Reputação
  if (
    /mercadol[íi]der\s+platinum/i.test(html) ||
    /"power_seller_status"\s*:\s*"platinum"/i.test(html)
  ) {
    result.seller_reputation = "platinum";
  } else if (
    /mercadol[íi]der\s+gold/i.test(html) ||
    /"power_seller_status"\s*:\s*"gold"/i.test(html)
  ) {
    result.seller_reputation = "gold";
  } else if (/loja\s+oficial/i.test(html)) {
    result.seller_reputation = "oficial";
  }

  // Vendedor
  if (!result.seller_name) {
    const sellerDomMatch =
      html.match(
        /class=["'][^"']*ui-pdp-seller__link-trigger[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
      ) || html.match(/Vendido\s+por\s+<[^>]+>([^<]+)<\//i);
    if (sellerDomMatch) {
      const stripped = sellerDomMatch[1].replace(/<[^>]+>/g, "").trim();
      if (stripped) result.seller_name = cleanSellerName(stripped);
    }
  }

  // Selo de promoção
  const discountMatch = html.match(/(\d{1,2}%\s*OFF)/i);
  if (discountMatch) {
    result.promo_badge = discountMatch[1].toUpperCase();
  } else if (/OFERTA\s+DO\s+DIA/i.test(html)) {
    result.promo_badge = "OFERTA DO DIA";
  } else if (/OFERTA\s+REL[ÂA]MPAGO/i.test(html)) {
    result.promo_badge = "OFERTA RELÂMPAGO";
  } else if (/OFERTA\s+IMPERD[ÍI]VEL/i.test(html)) {
    result.promo_badge = "OFERTA IMPERDÍVEL";
  }

  if (permalink) {
    result.permalink = permalink;
  }

  result.listing_created_at = estimateMlCreationDate(
    result.external_id || permalink,
    result.thumbnail_url,
    html
  );

  return result;
}

/**
 * Busca HTML resolvendo desafio PoW (_bmstate) e testando múltiplos User-Agents
 */
export async function scrapeCompetitorFromUrl(
  rawUrl: string,
  externalId?: string | null
): Promise<Partial<VerifiedCompetitorData> | null> {
  const urlsToTry: string[] = [];
  const normalized = normalizeCompetitorPermalink(rawUrl, externalId);
  if (normalized) urlsToTry.push(normalized);

  const mlbId = extractMlbId(externalId) || extractMlbId(rawUrl);
  if (mlbId) {
    const digits = mlbId.replace(/^MLB-?/i, "");
    const canonicalItemUrl = `https://produto.mercadolivre.com.br/MLB-${digits}`;
    if (!urlsToTry.includes(canonicalItemUrl)) {
      urlsToTry.push(canonicalItemUrl);
    }
  }

  let bestPartial: Partial<VerifiedCompetitorData> = {};

  const userAgents = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ];

  for (const targetUrl of urlsToTry) {
    for (const ua of userAgents) {
      try {
        const res = await fetch(targetUrl, {
          headers: {
            "User-Agent": ua,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
          },
          cache: "no-store",
        });

        if (!res.ok) continue;

        let html = await res.text();

        // Se recebeu cookie _bmstate e página de challenge, tenta resolver PoW SHA-256
        const setCookies =
          typeof (res.headers as any).getSetCookie === "function"
            ? (res.headers as any).getSetCookie()
            : [res.headers.get("set-cookie")].filter(Boolean);

        if (
          html.includes("bot-interceptor-muralla") &&
          setCookies.length > 0
        ) {
          const parsedMeta = parseCompetitorHtml(html, targetUrl);
          bestPartial = { ...bestPartial, ...parsedMeta };

          let bmstate = "";
          const cookieJar: string[] = [];
          for (const c of setCookies) {
            if (!c) continue;
            const kv = String(c).split(";")[0];
            cookieJar.push(kv);
            if (kv.startsWith("_bmstate=")) {
              bmstate = decodeURIComponent(kv.slice("_bmstate=".length));
            }
          }

          if (bmstate) {
            const [prefix, diffStr] = bmstate.split(";");
            const diff = Math.min(4, parseInt(diffStr, 10) || 0);
            const targetZeros = "0".repeat(diff);
            let nonce = 0;
            if (diff > 0) {
              for (let i = 0; i < 50000; i++) {
                const hash = createHash("sha256")
                  .update(prefix + i)
                  .digest("hex");
                if (hash.startsWith(targetZeros)) {
                  nonce = i;
                  break;
                }
              }
            }
            const now = Date.now();
            cookieJar.push(`_bmc=${encodeURIComponent(`${prefix};${nonce}`)}`);
            cookieJar.push(`_bm_skipml=true`);
            cookieJar.push(
              `_bm_timing=${encodeURIComponent(`${now - 120};${now};120;erp12345`)}`
            );

            const retryRes = await fetch(targetUrl, {
              headers: {
                "User-Agent": ua,
                Accept: "text/html,application/xhtml+xml",
                Cookie: cookieJar.join("; "),
              },
              cache: "no-store",
            }).catch(() => null);

            if (retryRes && retryRes.ok) {
              html = await retryRes.text();
            }
          }
        }

        const extracted = parseCompetitorHtml(html, targetUrl);
        bestPartial = {
          ...bestPartial,
          ...Object.fromEntries(
            Object.entries(extracted).filter(
              ([_, v]) => v !== undefined && v !== null && v !== ""
            )
          ),
        };

        if (bestPartial.current_price && bestPartial.current_price > 0) {
          return bestPartial;
        }
      } catch {
        // tenta próximo UA/URL
      }
    }
  }

  return Object.keys(bestPartial).length > 0 ? bestPartial : null;
}

/**
 * Obtém qualquer Access Token válido do Mercado Livre salvo no banco
 */
export async function resolveAnyActiveMlToken(
  userId?: string | null,
  organizationId?: string | null
): Promise<string | null> {
  try {
    if (userId) {
      const scopedToken = await getActiveMarketplaceToken("mercadolivre", {
        userId,
        organizationId: organizationId || null,
      });
      if (scopedToken) return scopedToken;
    }
  } catch {
    // continua para fallback
  }

  if (process.env.ML_ACCESS_TOKEN || process.env.MERCADOLIVRE_ACCESS_TOKEN) {
    return (
      process.env.ML_ACCESS_TOKEN ||
      process.env.MERCADOLIVRE_ACCESS_TOKEN ||
      null
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: row } = await supabase
      .from("marketplace_integrations")
      .select("id, access_token")
      .eq("platform", "mercadolivre")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (row?.access_token) {
      return decryptSecret(row.access_token);
    }
  } catch {
    // sem chave ou token
  }

  return null;
}

/**
 * Consulta a API Oficial do Mercado Livre (com token OAuth se disponível)
 * Suporta /items/{id}, /items?ids={id}, /user-products/{mlbuId} e busca de catálogo por título
 */
export async function fetchCompetitorViaMlApi(params: {
  mlbId?: string | null;
  mlbuId?: string | null;
  title?: string | null;
  sellerName?: string | null;
  permalink?: string | null;
  accessToken?: string | null;
}): Promise<Partial<VerifiedCompetitorData> | null> {
  const { mlbId, mlbuId, title, sellerName, permalink, accessToken } = params;

  const headers: Record<string, string> = {
    "User-Agent": "CRM-Marketplaces-ERP/2.0",
    Accept: "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let itemObj: any = null;

  // 1. Tenta /items/{mlbId} e /items?ids={mlbId}
  if (mlbId) {
    try {
      const directRes = await fetch(
        `https://api.mercadolibre.com/items/${mlbId}`,
        { headers, cache: "no-store" }
      );
      if (directRes.ok) {
        itemObj = await directRes.json();
      } else {
        const multiRes = await fetch(
          `https://api.mercadolibre.com/items?ids=${mlbId}`,
          { headers, cache: "no-store" }
        );
        if (multiRes.ok) {
          const multiData = await multiRes.json();
          if (Array.isArray(multiData) && multiData[0]?.code === 200) {
            itemObj = multiData[0].body;
          }
        }
      }
    } catch {
      // fallback abaixo
    }
  }

  // 2. Se tiver MLBU (User Product), tenta /user-products/{mlbuId}/items
  if (!itemObj && mlbuId && accessToken) {
    try {
      const upItemsRes = await fetch(
        `https://api.mercadolibre.com/user-products/${mlbuId}/items`,
        { headers, cache: "no-store" }
      );
      if (upItemsRes.ok) {
        const upData = await upItemsRes.json();
        const firstItemId = upData?.results?.[0]?.id || upData?.results?.[0];
        if (typeof firstItemId === "string") {
          const r = await fetch(
            `https://api.mercadolibre.com/items/${firstItemId}`,
            { headers, cache: "no-store" }
          );
          if (r.ok) itemObj = await r.json();
        }
      }
    } catch {
      // fallback abaixo
    }
  }

  // 3. Se conseguiu itemObj direto da API de itens:
  if (itemObj && Number(itemObj.price) > 0) {
    const resolvedItemId = itemObj.id || mlbId;
    let resolvedPrice = Number(itemObj.price);
    let resolvedOriginalPrice: number | null = itemObj.original_price
      ? Number(itemObj.original_price)
      : null;

    // Consulta /sale_price para pegar promoção ativa
    try {
      const spRes = await fetch(
        `https://api.mercadolibre.com/items/${resolvedItemId}/sale_price`,
        { headers, cache: "no-store" }
      );
      if (spRes.ok) {
        const spData = await spRes.json();
        if (spData?.amount && Number(spData.amount) > 0) {
          resolvedPrice = Number(spData.amount);
          if (
            spData.regular_amount &&
            Number(spData.regular_amount) > resolvedPrice
          ) {
            resolvedOriginalPrice = Number(spData.regular_amount);
          }
        }
      }
    } catch {
      // mantém itemObj.price
    }

    let shippingType = "padrao";
    if (itemObj.shipping?.logistic_type === "fulfillment") {
      shippingType = "ml_full";
    } else if (itemObj.shipping?.logistic_type === "self_service") {
      shippingType = "ml_flex";
    } else if (
      itemObj.shipping?.logistic_type === "cross_docking" ||
      itemObj.shipping?.logistic_type === "xd_drop_off"
    ) {
      shippingType = "ml_coleta";
    }

    let resolvedSellerName = sellerName ? cleanSellerName(sellerName) : "Concorrente";
    let resolvedReputation = "comum";

    if (itemObj.seller_id) {
      try {
        const sellerRes = await fetch(
          `https://api.mercadolibre.com/users/${itemObj.seller_id}`,
          { headers, cache: "no-store" }
        );
        if (sellerRes.ok) {
          const sData = await sellerRes.json();
          if (sData.nickname) resolvedSellerName = cleanSellerName(sData.nickname);
          const powerStatus = sData.seller_reputation?.power_seller_status;
          if (powerStatus) resolvedReputation = String(powerStatus).toLowerCase();
        }
      } catch {
        // mantém default
      }
    }

    return {
      title: itemObj.title,
      current_price: resolvedPrice,
      original_price: resolvedOriginalPrice,
      seller_name: resolvedSellerName,
      seller_reputation: resolvedReputation,
      shipping_type: shippingType,
      promo_badge: cleanPromoBadge(null, resolvedPrice, resolvedOriginalPrice),
      thumbnail_url: itemObj.thumbnail
        ? String(itemObj.thumbnail).replace("http://", "https://")
        : null,
      sales_count_approx: Number(itemObj.sold_quantity || 0),
      permalink: itemObj.permalink || permalink || undefined,
      external_id: resolvedItemId,
      source: "ml_api",
    };
  }

  // 4. Se for produto de catálogo (/products/search), busca correspondência por ID ou vendedor
  if (accessToken && title) {
    try {
      const searchRes = await fetch(
        `https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=${encodeURIComponent(
          title.slice(0, 60)
        )}&limit=5`,
        { headers, cache: "no-store" }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const products: any[] = searchData?.results || [];
        for (const p of products.slice(0, 3)) {
          const r = await fetch(
            `https://api.mercadolibre.com/products/${p.id}/items?limit=20`,
            { headers, cache: "no-store" }
          );
          if (!r.ok) continue;
          const d = await r.json();
          const results: any[] = d?.results || [];
          const matched = results.find(
            (it) =>
              (mlbId && it.item_id === mlbId) ||
              (mlbuId && it.user_product_id === mlbuId)
          );
          if (matched && Number(matched.price) > 0) {
            const price = Number(matched.price);
            const orig = matched.original_price
              ? Number(matched.original_price)
              : null;
            const isFull = matched.shipping?.logistic_type === "fulfillment";
            const isFlex = matched.shipping?.logistic_type === "self_service";
            return {
              title: p.name || title,
              current_price: price,
              original_price: orig,
              shipping_type: isFull
                ? "ml_full"
                : isFlex
                ? "ml_flex"
                : "padrao",
              promo_badge: cleanPromoBadge(null, price, orig),
              thumbnail_url: p.pictures?.[0]?.url || null,
              external_id: matched.item_id || mlbId || undefined,
              source: "ml_api",
            };
          }
        }
      }
    } catch {
      // ignora
    }
  }

  return null;
}

