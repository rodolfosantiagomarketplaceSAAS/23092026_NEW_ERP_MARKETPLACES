/**
 * Utilitários AppSec contra SSRF (Server-Side Request Forgery) e Injeção de Filtros PostgREST.
 */

const ALLOWED_MARKETPLACE_SUFFIXES = [
  "mercadolivre.com.br",
  "mercadolibre.com",
  "mercadolibre.com.ar",
  "mercadolibre.com.mx",
  "mlstatic.com",
  "shopee.com.br",
  "shopee.com",
];

function isIpLiteral(hostname: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.includes(":") || hostname.startsWith("[")) return true;
  return false;
}

/**
 * Valida estritamente se uma URL externa aponta via HTTPS para um domínio oficial permitido
 * do Mercado Livre ou Shopee, bloqueando SSRF contra IPs internos, cloud metadata ou domínios falsos
 * (ex: `https://mercadolivre.com.br.atacante.com` ou `http://169.254.169.254/mercadolivre.com.br`).
 */
export function parseSafeMarketplaceUrl(
  rawUrl?: string | null,
  options?: { platform?: "mercadolivre" | "shopee" | "any" }
): URL | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443") return null;

  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || isIpLiteral(host)) return null;

  const platform = options?.platform ?? "any";
  const suffixes =
    platform === "mercadolivre"
      ? ["mercadolivre.com.br", "mercadolibre.com", "mlstatic.com"]
      : platform === "shopee"
      ? ["shopee.com.br", "shopee.com"]
      : ALLOWED_MARKETPLACE_SUFFIXES;

  const allowed = suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );

  return allowed ? parsed : null;
}

/**
 * Sanitiza termos de busca antes de interpolar em cláusulas `.or(...)` do PostgREST,
 * removendo vírgulas, parênteses, barras e curingas de controle que poderiam alterar o predicado lógico.
 */
export function sanitizePostgrestFilterValue(raw?: string | null, maxLen = 120): string {
  if (!raw) return "";
  return raw
    .replace(/[,()\\*%'"`;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
