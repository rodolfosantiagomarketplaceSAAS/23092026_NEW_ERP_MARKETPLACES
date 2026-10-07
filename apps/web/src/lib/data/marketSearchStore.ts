import type { MarketSearchItem } from "@crm/types";

// Cache em memória de pesquisas sincronizadas pela Extensão Chrome
// Chave: `platform:termo_normalizado` -> Array de itens reais capturados
const globalSearchStore = new Map<string, { timestamp: number; items: MarketSearchItem[] }>();

function buildKey(query: string, platform: string): string {
  const normQ = query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return `${platform}:${normQ}`;
}

export function saveSyncedSearch(query: string, platform: string, items: MarketSearchItem[]) {
  const key = buildKey(query, platform);
  globalSearchStore.set(key, {
    timestamp: Date.now(),
    items,
  });
  // Também guarda com chave 'all' para buscas cross-marketplace
  globalSearchStore.set(`all:${query.trim().toLowerCase()}`, {
    timestamp: Date.now(),
    items,
  });
}

export function getSyncedSearch(query: string, platform: string): MarketSearchItem[] | null {
  const key = buildKey(query, platform);
  const entry = globalSearchStore.get(key);
  if (!entry) {
    // Tenta fallback sem a plataforma
    const allEntry = globalSearchStore.get(`all:${query.trim().toLowerCase()}`);
    return allEntry ? allEntry.items : null;
  }
  return entry.items;
}
