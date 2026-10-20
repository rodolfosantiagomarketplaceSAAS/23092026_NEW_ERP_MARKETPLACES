import type { MarketSearchItem } from "@crm/types";

// Cache em memória de pesquisas sincronizadas pela Extensão Chrome
// Anexado ao globalThis para persistir durante Hot-Reloading (HMR) no desenvolvimento Next.js
interface SearchStoreEntry {
  timestamp: number;
  items: MarketSearchItem[];
}

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

export function saveSyncedSearch(query: string, platform: string, items: MarketSearchItem[]) {
  const normQ = normalizeKey(query);
  const platKey = platform ? platform.toLowerCase() : "all";

  globalSearchStore.set(`${platKey}:${normQ}`, {
    timestamp: Date.now(),
    items,
  });
  // Guarda com chave 'all' para busca cross-marketplace
  globalSearchStore.set(`all:${normQ}`, {
    timestamp: Date.now(),
    items,
  });
}

export function getSyncedSearch(query: string, platform: string): MarketSearchItem[] | null {
  const normQ = normalizeKey(query);
  const platKey = platform ? platform.toLowerCase() : "all";

  // 1. Busca exata pela plataforma especificada
  const exact = globalSearchStore.get(`${platKey}:${normQ}`);
  if (exact && exact.items.length > 0) return exact.items;

  // 2. Busca exata na chave 'all'
  const allEntry = globalSearchStore.get(`all:${normQ}`);
  if (allEntry && allEntry.items.length > 0) return allEntry.items;

  // 3. Busca aproximada (ex: se pesquisou "bateria automotiva" e busca "bateria")
  let approximateMatch: MarketSearchItem[] | null = null;
  globalSearchStore.forEach((entry, key) => {
    if (approximateMatch) return;
    const keyTerm = key.split(":")[1] || "";
    if (keyTerm && (keyTerm.includes(normQ) || normQ.includes(keyTerm))) {
      if (entry.items && entry.items.length > 0) {
        approximateMatch = entry.items;
      }
    }
  });

  return approximateMatch;
}

