import type { CompetitorStore, CompetitorStoreListing } from "@crm/types";
import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "competitor_stores_cache.json");
let isInitialized = false;

export function hasDiskCache(): boolean {
  try {
    return fs.existsSync(CACHE_FILE);
  } catch {
    return false;
  }
}

function loadFromDisk() {
  if (isInitialized) return;
  isInitialized = true;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf-8");
      if (content.trim()) {
        const data = JSON.parse(content);
        if (Array.isArray(data?.stores)) {
          memoryStores = data.stores;
        }
        if (Array.isArray(data?.listings)) {
          memoryStoreListings = data.listings;
        }
      }
    }
  } catch (err) {
    console.warn("[Stores Cache] Falha ao carregar cache do disco:", err);
  }
}

function saveToDisk() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ stores: memoryStores, listings: memoryStoreListings }, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[Stores Cache] Falha ao salvar cache no disco:", err);
  }
}

// In-memory persistent cache for instant loading & offline/fallback mode
let memoryStores: CompetitorStore[] = [];
let memoryStoreListings: CompetitorStoreListing[] = [];

export function getMemoryStores(userId?: string): CompetitorStore[] {
  loadFromDisk();
  return [...memoryStores];
}

export function getMemoryStoreById(id: string): CompetitorStore | null {
  loadFromDisk();
  return memoryStores.find((s) => s.id === id) || null;
}

export function getMemoryStoreListings(storeId?: string): CompetitorStoreListing[] {
  loadFromDisk();
  if (storeId && storeId !== "all") {
    return memoryStoreListings.filter((l) => l.store_id === storeId);
  }
  return [...memoryStoreListings];
}

export function updateMemoryStore(
  id: string,
  updates: Partial<Pick<CompetitorStore, "segment" | "is_following" | "store_name" | "notes">>
): CompetitorStore | null {
  loadFromDisk();
  const idx = memoryStores.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  memoryStores[idx] = {
    ...memoryStores[idx],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  // If segment changed, update cached store_segment in listings
  if (updates.segment) {
    memoryStoreListings = memoryStoreListings.map((l) =>
      l.store_id === id ? { ...l, store_segment: updates.segment } : l
    );
  }

  saveToDisk();
  return memoryStores[idx];
}

export function deleteMemoryStore(id: string): boolean {
  loadFromDisk();
  const initialLen = memoryStores.length;
  memoryStores = memoryStores.filter((s) => s.id !== id);
  memoryStoreListings = memoryStoreListings.filter((l) => l.store_id !== id);
  saveToDisk();
  return true;
}

export function upsertMemoryStoreScrape(
  storeData: {
    platform?: "mercadolivre" | "shopee";
    store_name: string;
    seller_id?: string | null;
    seller_nickname?: string | null;
    store_url: string;
    segment?: string;
    is_following?: boolean;
    seller_reputation?: string;
    notes?: string | null;
    total_listings?: number;
  },
  items: Array<{
    external_id: string;
    title: string;
    current_price: number;
    original_price?: number | null;
    discount_pct?: number | null;
    sales_count_approx?: number;
    listing_created_at?: string | null;
    shipping_type?: string;
    is_full?: boolean;
    is_free_shipping?: boolean;
    promo_badge?: string | null;
    permalink: string;
    thumbnail_url?: string | null;
    rating?: number;
    reviews_count?: number;
    estimated_sale_fee?: number;
    estimated_net?: number;
    estimated_shipping?: number | null;
    is_catalog?: boolean;
    listing_type?: string | null;
  }>,
  userId = "user_default"
): { store: CompetitorStore; listingsCount: number } {
  loadFromDisk();
  // Normalize URL
  const cleanUrl = storeData.store_url.trim().split("?")[0].replace(/\/+$/, "");
  let store = memoryStores.find(
    (s) => s.store_url.split("?")[0].replace(/\/+$/, "") === cleanUrl || (storeData.seller_id && s.seller_id === storeData.seller_id)
  );

  // Deduplica itens por external_id
  const seenIds = new Set<string>();
  const uniqueItems = items.filter((it) => {
    if (!it.external_id) return true;
    if (seenIds.has(it.external_id)) return false;
    seenIds.add(it.external_id);
    return true;
  });

  const nowIso = new Date().toISOString();
  // Vendas diretas da loja (não infla com 100k de catálogo global)
  const totalSales = uniqueItems.reduce((acc, i) => {
    if (i.is_catalog) {
      return acc + Math.min(i.sales_count_approx || 0, 50);
    }
    return acc + (i.sales_count_approx || 0);
  }, 0);
  const totalPrice = uniqueItems.reduce((acc, i) => acc + (i.current_price || 0), 0);
  const avgTicket = uniqueItems.length > 0 ? Number((totalPrice / uniqueItems.length).toFixed(2)) : 0;
  const totalListings = storeData.total_listings && storeData.total_listings > 0
    ? storeData.total_listings
    : uniqueItems.length;

  if (store) {
    store.store_name = storeData.store_name || store.store_name;
    store.seller_reputation = storeData.seller_reputation || store.seller_reputation;
    if (storeData.segment && storeData.segment !== "Geral") {
      store.segment = storeData.segment;
    }
    if (typeof storeData.is_following === "boolean") {
      store.is_following = storeData.is_following;
    }
    store.total_listings = totalListings;
    store.total_sales_approx = totalSales;
    store.avg_ticket = avgTicket;
    store.last_scraped_at = nowIso;
    store.updated_at = nowIso;
  } else {
    store = {
      id: `store_${Date.now()}`,
      user_id: userId,
      platform: storeData.platform || "mercadolivre",
      store_name: storeData.store_name,
      seller_id: storeData.seller_id || null,
      seller_nickname: storeData.seller_nickname || null,
      store_url: storeData.store_url,
      segment: storeData.segment || "Geral",
      is_following: storeData.is_following !== undefined ? storeData.is_following : true,
      seller_reputation: storeData.seller_reputation || "platinum",
      notes: storeData.notes || null,
      total_listings: totalListings,
      total_sales_approx: totalSales,
      avg_ticket: avgTicket,
      last_scraped_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };
    memoryStores.unshift(store);
  }

  // Remove existing listings for this store from memory to replace with fresh ones
  memoryStoreListings = memoryStoreListings.filter((l) => l.store_id !== store!.id);

  // Add fresh unique listings
  for (const item of uniqueItems) {
    const listingCreatedAt = item.listing_created_at || new Date().toISOString();
    const isNew = isListingNew(listingCreatedAt);

    memoryStoreListings.push({
      id: `csl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      store_id: store.id,
      user_id: userId,
      platform: store.platform,
      external_id: item.external_id,
      title: item.title,
      current_price: item.current_price,
      original_price: item.original_price || null,
      discount_pct: item.discount_pct || null,
      sales_count_approx: item.sales_count_approx || 0,
      listing_created_at: listingCreatedAt,
      is_new_listing: isNew,
      shipping_type: item.shipping_type || "padrao",
      is_full: !!item.is_full,
      is_free_shipping: !!item.is_free_shipping,
      promo_badge: item.promo_badge || null,
      permalink: item.permalink,
      thumbnail_url: item.thumbnail_url || null,
      rating: item.rating || 5.0,
      reviews_count: item.reviews_count || 0,
      estimated_sale_fee: item.estimated_sale_fee || 0,
      estimated_net: item.estimated_net || 0,
      estimated_shipping: item.estimated_shipping ?? null,
      is_catalog: !!item.is_catalog,
      listing_type: item.listing_type || null,
      last_scraped_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      store_name: store.store_name,
      store_segment: store.segment,
    });
  }

  saveToDisk();
  return { store, listingsCount: uniqueItems.length };
}

function isListingNew(createdAtStr?: string | null): boolean {
  if (!createdAtStr) return false;
  const d = new Date(createdAtStr);
  if (isNaN(d.getTime())) return false;
  const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 30; // Criado nos últimos 30 dias é considerado "NOVO"
}

