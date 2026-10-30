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
    } else {
      // First boot: persist the initial seed demo stores
      saveToDisk();
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
let memoryStores: CompetitorStore[] = [
  {
    id: "store-ml-001",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    store_name: "AutoShine Acessórios & Películas",
    seller_id: "49281726",
    seller_nickname: "AUTOSHINE_OFICIAL",
    store_url: "https://www.mercadolivre.com.br/pagina/autoshine_oficial",
    segment: "Acessórios Automotivos",
    is_following: true,
    seller_reputation: "platinum",
    notes: "Líder de vendas em películas automotivas PPF e soleiras com alta taxa de conversão no Full.",
    total_listings: 4,
    total_sales_approx: 14850,
    avg_ticket: 88.50,
    last_scraped_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: "store-ml-002",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    store_name: "TechArmor Proteção Premium",
    seller_id: "81920384",
    seller_nickname: "TECHARMOR_BRASIL",
    store_url: "https://lista.mercadolivre.com.br/_CustId_81920384",
    segment: "Películas & Proteção",
    is_following: true,
    seller_reputation: "gold",
    notes: "Concorrente direto com produtos importados TPU autoregenerativos.",
    total_listings: 3,
    total_sales_approx: 9320,
    avg_ticket: 149.90,
    last_scraped_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "store-ml-003",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    store_name: "Garage Pro Peças & Tuning",
    seller_id: "19284729",
    seller_nickname: "GARAGE_PRO_SP",
    store_url: "https://www.mercadolivre.com.br/pagina/garagepro",
    segment: "Tuning & Estética",
    is_following: false,
    seller_reputation: "platinum",
    notes: "Preços agressivos com frete grátis em kits combinados.",
    total_listings: 3,
    total_sales_approx: 5120,
    avg_ticket: 64.90,
    last_scraped_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 18).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
];

let memoryStoreListings: CompetitorStoreListing[] = [
  // Loja 1
  {
    id: "csl-001",
    store_id: "store-ml-001",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB3492817263",
    title: "Película PPF TPU Autoregenerativa Proteção Maçaneta Carro 4 Portas",
    current_price: 39.90,
    original_price: 49.90,
    discount_pct: 20,
    sales_count_approx: 4850,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(), // Criado há 12 dias (NOVO!)
    shipping_type: "ml_full",
    is_full: true,
    is_free_shipping: false,
    promo_badge: "OFERTA DO DIA",
    permalink: "https://produto.mercadolivre.com.br/MLB-3492817263-pelicula-ppf-tpu-autoregenerativa-macaneta-4-portas",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_892341-MLB712398412-F.webp",
    rating: 4.9,
    reviews_count: 512,
    estimated_sale_fee: 6.78,
    estimated_net: 33.12,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "AutoShine Acessórios & Películas",
    store_segment: "Acessórios Automotivos",
  },
  {
    id: "csl-002",
    store_id: "store-ml-001",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB3829104821",
    title: "Kit Película PPF Farol Fumê Claro Transparente Proteção UV 2 Metros",
    current_price: 79.90,
    original_price: 99.00,
    discount_pct: 19,
    sales_count_approx: 6200,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 75).toISOString(),
    shipping_type: "ml_full",
    is_full: true,
    is_free_shipping: true,
    promo_badge: "MAIS VENDIDO",
    permalink: "https://produto.mercadolivre.com.br/MLB-3829104821-kit-pelicula-ppf-farol-fume-claro-2m",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_789123-MLB512398412-F.webp",
    rating: 4.8,
    reviews_count: 730,
    estimated_sale_fee: 12.78,
    estimated_net: 54.12,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "AutoShine Acessórios & Películas",
    store_segment: "Acessórios Automotivos",
  },
  {
    id: "csl-003",
    store_id: "store-ml-001",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB4102938491",
    title: "Película Proteção Soleira Automotiva Universal Black Carbono 4 Peças",
    current_price: 49.90,
    original_price: 59.90,
    discount_pct: 16,
    sales_count_approx: 2900,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), // Criado há 5 dias (NOVO!)
    shipping_type: "ml_full",
    is_full: true,
    is_free_shipping: false,
    promo_badge: "LANÇAMENTO",
    permalink: "https://produto.mercadolivre.com.br/MLB-4102938491-pelicula-soleira-carbono-4-pecas",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_612345-MLB612398412-F.webp",
    rating: 4.7,
    reviews_count: 140,
    estimated_sale_fee: 8.48,
    estimated_net: 41.42,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "AutoShine Acessórios & Películas",
    store_segment: "Acessórios Automotivos",
  },
  {
    id: "csl-004",
    store_id: "store-ml-001",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB4291039481",
    title: "Película PPF Parachoque Traseiro Borda Porta-Malas Anti-Risco 1,20m",
    current_price: 54.90,
    original_price: 69.90,
    discount_pct: 21,
    sales_count_approx: 900,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // Criado há 2 dias (NOVO!)
    shipping_type: "padrao",
    is_full: false,
    is_free_shipping: false,
    promo_badge: "NOVIDADE",
    permalink: "https://produto.mercadolivre.com.br/MLB-4291039481-pelicula-ppf-porta-malas-120m",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_918273-MLB412398412-F.webp",
    rating: 5.0,
    reviews_count: 28,
    estimated_sale_fee: 9.33,
    estimated_net: 45.57,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "AutoShine Acessórios & Películas",
    store_segment: "Acessórios Automotivos",
  },

  // Loja 2
  {
    id: "csl-005",
    store_id: "store-ml-002",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB3910293847",
    title: "Película PPF TPU Teto Black Piano Brilhante 1.52m x 2m Termomoldável",
    current_price: 189.90,
    original_price: 229.00,
    discount_pct: 17,
    sales_count_approx: 5400,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
    shipping_type: "ml_full",
    is_full: true,
    is_free_shipping: true,
    promo_badge: "DESTAQUE",
    permalink: "https://produto.mercadolivre.com.br/MLB-3910293847-pelicula-ppf-teto-black-piano-2m",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_736291-MLB812398412-F.webp",
    rating: 4.9,
    reviews_count: 680,
    estimated_sale_fee: 30.38,
    estimated_net: 139.52,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "TechArmor Proteção Premium",
    store_segment: "Películas & Proteção",
  },
  {
    id: "csl-006",
    store_id: "store-ml-002",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB4029182736",
    title: "Kit Espátulas Profissionais + Estilete e Soprador para Aplicação PPF",
    current_price: 119.90,
    original_price: null,
    discount_pct: null,
    sales_count_approx: 2800,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(), // Criado há 14 dias (NOVO!)
    shipping_type: "ml_full",
    is_full: true,
    is_free_shipping: true,
    promo_badge: null,
    permalink: "https://produto.mercadolivre.com.br/MLB-4029182736-kit-espatulas-aplicacao-ppf",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_847291-MLB912398412-F.webp",
    rating: 4.8,
    reviews_count: 310,
    estimated_sale_fee: 19.18,
    estimated_net: 85.72,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "TechArmor Proteção Premium",
    store_segment: "Películas & Proteção",
  },
  {
    id: "csl-007",
    store_id: "store-ml-002",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB4192039481",
    title: "Película PPF Frontal Completa Capô + Parachoque Transparente TPU 5m",
    current_price: 349.90,
    original_price: 399.00,
    discount_pct: 12,
    sales_count_approx: 1120,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(), // Criado há 8 dias (NOVO!)
    shipping_type: "ml_full",
    is_full: true,
    is_free_shipping: true,
    promo_badge: "PREMIUM",
    permalink: "https://produto.mercadolivre.com.br/MLB-4192039481-pelicula-ppf-capo-parachoque-5m",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_629182-MLB712398412-F.webp",
    rating: 5.0,
    reviews_count: 154,
    estimated_sale_fee: 55.98,
    estimated_net: 271.47,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "TechArmor Proteção Premium",
    store_segment: "Películas & Proteção",
  },

  // Loja 3
  {
    id: "csl-008",
    store_id: "store-ml-003",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB3719284910",
    title: "Película Fume Lanterna Traseira Automotiva Rolo 30cm x 1 Metro",
    current_price: 29.90,
    original_price: 35.00,
    discount_pct: 15,
    sales_count_approx: 3200,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
    shipping_type: "padrao",
    is_full: false,
    is_free_shipping: false,
    promo_badge: null,
    permalink: "https://produto.mercadolivre.com.br/MLB-3719284910-pelicula-fume-lanterna-traseira-1m",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_736192-MLB312398412-F.webp",
    rating: 4.6,
    reviews_count: 420,
    estimated_sale_fee: 5.08,
    estimated_net: 24.82,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "Garage Pro Peças & Tuning",
    store_segment: "Tuning & Estética",
  },
  {
    id: "csl-009",
    store_id: "store-ml-003",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB3820194829",
    title: "Fita Adesiva Refletiva Segurança Roda Carro e Moto 16 Filetes",
    current_price: 34.90,
    original_price: 42.00,
    discount_pct: 16,
    sales_count_approx: 1420,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22).toISOString(), // Criado há 22 dias (NOVO!)
    shipping_type: "padrao",
    is_full: false,
    is_free_shipping: false,
    promo_badge: "POPULAR",
    permalink: "https://produto.mercadolivre.com.br/MLB-3820194829-fita-adesiva-refletiva-roda-16-filetes",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_918274-MLB212398412-F.webp",
    rating: 4.7,
    reviews_count: 180,
    estimated_sale_fee: 5.93,
    estimated_net: 28.97,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "Garage Pro Peças & Tuning",
    store_segment: "Tuning & Estética",
  },
  {
    id: "csl-010",
    store_id: "store-ml-003",
    user_id: "demo-user-id",
    platform: "mercadolivre",
    external_id: "MLB4120938472",
    title: "Kit Protetor Quina de Porta Bate-Porta Transparente Silicone 4 Peças",
    current_price: 24.90,
    original_price: null,
    discount_pct: null,
    sales_count_approx: 500,
    listing_created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), // Criado há 3 dias (NOVO!)
    shipping_type: "padrao",
    is_full: false,
    is_free_shipping: false,
    promo_badge: "NOVO",
    permalink: "https://produto.mercadolivre.com.br/MLB-4120938472-kit-protetor-quina-porta-silicone",
    thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_819273-MLB112398412-F.webp",
    rating: 4.8,
    reviews_count: 45,
    estimated_sale_fee: 4.23,
    estimated_net: 20.67,
    last_scraped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    store_name: "Garage Pro Peças & Tuning",
    store_segment: "Tuning & Estética",
  },
];

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
  }>,
  userId = "user_default"
): { store: CompetitorStore; listingsCount: number } {
  loadFromDisk();
  // Normalize URL
  const cleanUrl = storeData.store_url.trim().split("?")[0].replace(/\/+$/, "");
  let store = memoryStores.find(
    (s) => s.store_url.split("?")[0].replace(/\/+$/, "") === cleanUrl || (storeData.seller_id && s.seller_id === storeData.seller_id)
  );

  const nowIso = new Date().toISOString();
  const totalSales = items.reduce((acc, i) => acc + (i.sales_count_approx || 0), 0);
  const totalPrice = items.reduce((acc, i) => acc + (i.current_price || 0), 0);
  const avgTicket = items.length > 0 ? Number((totalPrice / items.length).toFixed(2)) : 0;

  if (store) {
    store.store_name = storeData.store_name || store.store_name;
    store.seller_reputation = storeData.seller_reputation || store.seller_reputation;
    if (storeData.segment && storeData.segment !== "Geral") {
      store.segment = storeData.segment;
    }
    if (typeof storeData.is_following === "boolean") {
      store.is_following = storeData.is_following;
    }
    store.total_listings = items.length;
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
      total_listings: items.length,
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

  // Add fresh listings
  for (const item of items) {
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
      last_scraped_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      store_name: store.store_name,
      store_segment: store.segment,
    });
  }

  saveToDisk();
  return { store, listingsCount: items.length };
}

function isListingNew(createdAtStr?: string | null): boolean {
  if (!createdAtStr) return false;
  const d = new Date(createdAtStr);
  if (isNaN(d.getTime())) return false;
  const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 30; // Criado nos últimos 30 dias é considerado "NOVO"
}

