import type { SavedOpportunityListing, SavedOpportunityStatus } from "@crm/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "competitor_saved_listings_cache.json");

let isInitialized = false;
let memorySavedListings: SavedOpportunityListing[] = [];

function loadFromDisk() {
  if (isInitialized) return;
  isInitialized = true;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf-8");
      if (content.trim()) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          memorySavedListings = parsed;
        } else if (Array.isArray(parsed?.items)) {
          memorySavedListings = parsed.items;
        }
      }
    }
  } catch (err) {
    console.warn("[SavedListings Cache] Falha ao carregar cache do disco:", err);
  }
}

function saveToDisk() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ items: memorySavedListings }, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[SavedListings Cache] Falha ao salvar cache no disco:", err);
  }
}

function mapRowToSavedListing(row: any): SavedOpportunityListing {
  return {
    id: String(row.id),
    user_id: String(row.user_id || "00000000-0000-0000-0000-000000000000"),
    platform: row.platform === "shopee" ? "shopee" : "mercadolivre",
    external_id: String(row.external_id || ""),
    title: String(row.title || "Anúncio sem título"),
    current_price: Number(row.current_price || 0),
    original_price: row.original_price ? Number(row.original_price) : null,
    discount_pct: row.discount_pct !== null && row.discount_pct !== undefined ? Number(row.discount_pct) : null,
    promo_badge: row.promo_badge || null,
    sales_count_approx: Number(row.sales_count_approx || 0),
    listing_created_at: row.listing_created_at || null,
    shipping_type: String(row.shipping_type || "padrao"),
    is_full: Boolean(row.is_full),
    is_free_shipping: Boolean(row.is_free_shipping),
    listing_type: row.listing_type || "gold_pro",
    is_catalog: Boolean(row.is_catalog),
    estimated_sale_fee: Number(row.estimated_sale_fee || 0),
    estimated_shipping:
      row.estimated_shipping !== null && row.estimated_shipping !== undefined
        ? Number(row.estimated_shipping)
        : 0,
    estimated_net: Number(row.estimated_net || 0),
    seller_name: String(row.seller_name || "Concorrente"),
    seller_reputation: row.seller_reputation || "platinum",
    seller_location: row.seller_location || null,
    store_segment: row.store_segment || "Geral",
    permalink: String(row.permalink || ""),
    thumbnail_url: row.thumbnail_url || null,
    rating: Number(row.rating || 5.0),
    reviews_count: Number(row.reviews_count || 0),
    status: row.status === "created" ? "created" : "pending",
    notes: row.notes || null,
    my_created_sku: row.my_created_sku || null,
    created_in_store_at: row.created_in_store_at || null,
    last_scraped_at: row.last_scraped_at || new Date().toISOString(),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

export async function listSavedOpportunityListings(
  userId?: string
): Promise<SavedOpportunityListing[]> {
  loadFromDisk();

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("competitor_saved_listings")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      const dbItems = data.map(mapRowToSavedListing);
      // Merge disk items not yet in DB
      const dbExtSet = new Set(dbItems.map((i) => i.external_id));
      const merged = [...dbItems];
      for (const localItem of memorySavedListings) {
        if (!dbExtSet.has(localItem.external_id)) {
          merged.push(localItem);
        }
      }
      memorySavedListings = merged;
      saveToDisk();
      return merged;
    }
  } catch {
    // Fallback para cache em disco se a tabela ainda não foi criada no Supabase
  }

  return [...memorySavedListings].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function upsertSavedOpportunityListing(
  input: Omit<
    SavedOpportunityListing,
    "id" | "created_at" | "updated_at" | "last_scraped_at"
  > & { id?: string }
): Promise<SavedOpportunityListing> {
  loadFromDisk();
  const now = new Date().toISOString();

  const existingIdx = memorySavedListings.findIndex(
    (item) =>
      item.external_id === input.external_id ||
      (input.id && item.id === input.id)
  );

  const existing = existingIdx >= 0 ? memorySavedListings[existingIdx] : null;

  const record: SavedOpportunityListing = {
    id: existing?.id || input.id || randomUUID(),
    user_id: input.user_id || existing?.user_id || "00000000-0000-0000-0000-000000000000",
    platform: input.platform || existing?.platform || "mercadolivre",
    external_id: input.external_id,
    title: input.title || existing?.title || "Anúncio Concorrente",
    current_price: Number(input.current_price ?? existing?.current_price ?? 0),
    original_price:
      input.original_price !== undefined
        ? input.original_price
        : existing?.original_price ?? null,
    discount_pct:
      input.discount_pct !== undefined
        ? input.discount_pct
        : existing?.discount_pct ?? null,
    promo_badge:
      input.promo_badge !== undefined
        ? input.promo_badge
        : existing?.promo_badge ?? null,
    sales_count_approx: Number(
      input.sales_count_approx ?? existing?.sales_count_approx ?? 0
    ),
    listing_created_at:
      input.listing_created_at || existing?.listing_created_at || null,
    shipping_type: input.shipping_type || existing?.shipping_type || "padrao",
    is_full: Boolean(input.is_full ?? existing?.is_full ?? false),
    is_free_shipping: Boolean(
      input.is_free_shipping ?? existing?.is_free_shipping ?? false
    ),
    listing_type: input.listing_type || existing?.listing_type || "gold_pro",
    is_catalog: Boolean(input.is_catalog ?? existing?.is_catalog ?? false),
    estimated_sale_fee: Number(
      input.estimated_sale_fee ?? existing?.estimated_sale_fee ?? 0
    ),
    estimated_shipping:
      input.estimated_shipping !== undefined
        ? input.estimated_shipping
        : existing?.estimated_shipping ?? 0,
    estimated_net: Number(input.estimated_net ?? existing?.estimated_net ?? 0),
    seller_name: input.seller_name || existing?.seller_name || "Concorrente",
    seller_reputation:
      input.seller_reputation || existing?.seller_reputation || "platinum",
    seller_location:
      input.seller_location !== undefined
        ? input.seller_location
        : existing?.seller_location ?? null,
    store_segment: input.store_segment || existing?.store_segment || "Geral",
    permalink: input.permalink || existing?.permalink || "",
    thumbnail_url:
      input.thumbnail_url !== undefined
        ? input.thumbnail_url
        : existing?.thumbnail_url ?? null,
    rating: Number(input.rating ?? existing?.rating ?? 5.0),
    reviews_count: Number(input.reviews_count ?? existing?.reviews_count ?? 0),
    status: input.status || existing?.status || "pending",
    notes: input.notes !== undefined ? input.notes : existing?.notes ?? null,
    my_created_sku:
      input.my_created_sku !== undefined
        ? input.my_created_sku
        : existing?.my_created_sku ?? null,
    created_in_store_at:
      input.created_in_store_at !== undefined
        ? input.created_in_store_at
        : existing?.created_in_store_at ?? null,
    last_scraped_at: now,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existingIdx >= 0) {
    memorySavedListings[existingIdx] = record;
  } else {
    memorySavedListings.unshift(record);
  }
  saveToDisk();

  // Tenta persistir no Supabase se a tabela existir
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("competitor_saved_listings")
      .upsert(
        {
          id: record.id,
          user_id: record.user_id,
          platform: record.platform,
          external_id: record.external_id,
          title: record.title,
          current_price: record.current_price,
          original_price: record.original_price,
          discount_pct: record.discount_pct,
          promo_badge: record.promo_badge,
          sales_count_approx: record.sales_count_approx,
          listing_created_at: record.listing_created_at,
          shipping_type: record.shipping_type,
          is_full: record.is_full,
          is_free_shipping: record.is_free_shipping,
          listing_type: record.listing_type,
          is_catalog: record.is_catalog,
          estimated_sale_fee: record.estimated_sale_fee,
          estimated_shipping: record.estimated_shipping,
          estimated_net: record.estimated_net,
          seller_name: record.seller_name,
          seller_reputation: record.seller_reputation,
          store_segment: record.store_segment,
          permalink: record.permalink,
          thumbnail_url: record.thumbnail_url,
          rating: record.rating,
          reviews_count: record.reviews_count,
          status: record.status,
          notes: record.notes,
          my_created_sku: record.my_created_sku,
          created_in_store_at: record.created_in_store_at,
          last_scraped_at: record.last_scraped_at,
          updated_at: record.updated_at,
        },
        { onConflict: "user_id,external_id" }
      )
      .select("*")
      .single();

    if (!error && data) {
      const synced = mapRowToSavedListing(data);
      const idx = memorySavedListings.findIndex(
        (i) => i.external_id === synced.external_id || i.id === record.id
      );
      if (idx >= 0) {
        memorySavedListings[idx] = synced;
        saveToDisk();
      }
      return synced;
    }
  } catch {
    // Mantém salvo no cache local
  }

  return record;
}

export async function updateSavedOpportunityListing(
  idOrExternalId: string,
  updates: {
    status?: SavedOpportunityStatus;
    notes?: string | null;
    my_created_sku?: string | null;
    current_price?: number;
    original_price?: number | null;
    discount_pct?: number | null;
    promo_badge?: string | null;
    sales_count_approx?: number;
    listing_created_at?: string | null;
    estimated_sale_fee?: number;
    estimated_shipping?: number | null;
    estimated_net?: number;
    seller_name?: string;
    thumbnail_url?: string | null;
  }
): Promise<SavedOpportunityListing | null> {
  loadFromDisk();
  const now = new Date().toISOString();

  const idx = memorySavedListings.findIndex(
    (item) => item.id === idOrExternalId || item.external_id === idOrExternalId
  );

  let updatedRecord: SavedOpportunityListing | null = null;

  if (idx >= 0) {
    const prev = memorySavedListings[idx];
    const nextStatus = updates.status ?? prev.status;
    const createdInStoreAt =
      updates.status === "created"
        ? prev.created_in_store_at || now
        : updates.status === "pending"
        ? null
        : prev.created_in_store_at;

    updatedRecord = {
      ...prev,
      ...updates,
      status: nextStatus,
      created_in_store_at: createdInStoreAt,
      updated_at: now,
    };
    memorySavedListings[idx] = updatedRecord;
    saveToDisk();
  }

  try {
    const supabase = createSupabaseAdminClient();
    const dbPatch: Record<string, any> = {
      ...updates,
      updated_at: now,
    };
    if (updates.status === "created") {
      dbPatch.created_in_store_at = now;
    } else if (updates.status === "pending") {
      dbPatch.created_in_store_at = null;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrExternalId
    );
    const query = supabase
      .from("competitor_saved_listings")
      .update(dbPatch);

    const { data, error } = await (isUuid
      ? query.eq("id", idOrExternalId)
      : query.eq("external_id", idOrExternalId)
    )
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const mapped = mapRowToSavedListing(data);
      const localIdx = memorySavedListings.findIndex(
        (i) => i.id === mapped.id || i.external_id === mapped.external_id
      );
      if (localIdx >= 0) {
        memorySavedListings[localIdx] = mapped;
      } else {
        memorySavedListings.unshift(mapped);
      }
      saveToDisk();
      return mapped;
    }
  } catch {
    // Fallback para cache em disco
  }

  return updatedRecord;
}

export async function getSavedOpportunityByIdOrExt(
  idOrExternalId: string
): Promise<SavedOpportunityListing | null> {
  const list = await listSavedOpportunityListings();
  return (
    list.find(
      (i) => i.id === idOrExternalId || i.external_id === idOrExternalId
    ) || null
  );
}

export async function deleteSavedOpportunityListing(
  idOrExternalId: string
): Promise<boolean> {
  loadFromDisk();
  const target = memorySavedListings.find(
    (item) => item.id === idOrExternalId || item.external_id === idOrExternalId
  );

  memorySavedListings = memorySavedListings.filter(
    (item) => item.id !== idOrExternalId && item.external_id !== idOrExternalId
  );
  saveToDisk();

  try {
    const supabase = createSupabaseAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrExternalId
    );
    if (isUuid) {
      await supabase
        .from("competitor_saved_listings")
        .delete()
        .eq("id", idOrExternalId);
    }
    if (target?.external_id || !isUuid) {
      await supabase
        .from("competitor_saved_listings")
        .delete()
        .eq("external_id", target?.external_id || idOrExternalId);
    }
  } catch {
    // Ignora erro se tabela ainda não existir no Supabase
  }

  return true;
}

