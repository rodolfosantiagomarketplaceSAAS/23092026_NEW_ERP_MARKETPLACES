import type { MarketSearchItem } from "@crm/types";

interface SearchStoreEntry {
  timestamp: number;
  items: MarketSearchItem[];
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

const globalForStore = globalThis as unknown as {
  __crmMarketSearchStore?: Map<string, SearchStoreEntry>;
};

const globalSearchStore =
  globalForStore.__crmMarketSearchStore || new Map<string, SearchStoreEntry>();

if (!globalForStore.__crmMarketSearchStore) {
  globalForStore.__crmMarketSearchStore = globalSearchStore;
}

function normalizeKey(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Armazena pesquisa em memória particionada por `tenantKey` (`organizationId || userId`),
 * impedindo vazamento de cache entre lojas diferentes na mesma instância Node.js.
 */
export function saveSyncedSearch(
  query: string,
  platform: string,
  items: MarketSearchItem[],
  tenantKey = "isolated"
) {
  const normQ = normalizeKey(query);
  const platKey = platform ? platform.toLowerCase() : "all";
  const scopePrefix = normalizeKey(tenantKey) || "isolated";

  globalSearchStore.set(`${scopePrefix}|${platKey}:${normQ}`, {
    timestamp: Date.now(),
    items,
  });
  globalSearchStore.set(`${scopePrefix}|all:${normQ}`, {
    timestamp: Date.now(),
    items,
  });
}

export function getSyncedSearch(
  query: string,
  platform: string,
  tenantKey = "isolated"
): MarketSearchItem[] | null {
  const normQ = normalizeKey(query);
  const platKey = platform ? platform.toLowerCase() : "all";
  const scopePrefix = normalizeKey(tenantKey) || "isolated";
  const now = Date.now();

  const exact = globalSearchStore.get(`${scopePrefix}|${platKey}:${normQ}`);
  if (exact && now - exact.timestamp <= CACHE_TTL_MS && exact.items.length > 0) {
    return exact.items;
  }

  const allEntry = globalSearchStore.get(`${scopePrefix}|all:${normQ}`);
  if (allEntry && now - allEntry.timestamp <= CACHE_TTL_MS && allEntry.items.length > 0) {
    return allEntry.items;
  }

  let approximateMatch: MarketSearchItem[] | null = null;
  globalSearchStore.forEach((entry, key) => {
    if (approximateMatch) return;
    if (!key.startsWith(`${scopePrefix}|`)) return;
    if (now - entry.timestamp > CACHE_TTL_MS) return;

    const keyTerm = key.split(":")[1] || "";
    if (keyTerm && (keyTerm.includes(normQ) || normQ.includes(keyTerm))) {
      if (entry.items && entry.items.length > 0) {
        approximateMatch = entry.items;
      }
    }
  });

  return approximateMatch;
}
