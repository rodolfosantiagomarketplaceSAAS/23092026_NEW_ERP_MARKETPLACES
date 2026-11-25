/**
 * Tipos normalizados da Arquitetura Oficial "User Products" (3 Níveis) do Mercado Livre:
 *  - Nível 1: ml_families (Anúncio Principal / Família)
 *  - Nível 2: ml_variations (Sub-anúncio / User Product / SKU / Estoque unificado)
 *  - Nível 3: ml_sale_options (Opções de Venda / Anúncios MLB individuais)
 */

export type MlListingChannel = "classic" | "premium";

export interface MlVariationMlbRef {
  item_id: string;
  clean_digits: string;
  permalink: string;
  listing_type_id: string;
  channel_label: "Clássico" | "Premium";
  catalog_listing: boolean;
  status: string;
}

export interface MlFamilyUpsertInput {
  family_id: string;
  is_official_family_id: boolean;
  title: string;
  thumbnail_url: string | null;
  status: "active" | "paused" | "closed";
}

export interface MlVariationUpsertInput {
  user_product_id: string;
  family_id: string;
  variation_name: string;
  sku: string | null;
  thumbnail_url: string | null;
  available_quantity: number;
  mlbs_list: MlVariationMlbRef[];
}

export interface MlSaleOptionUpsertInput {
  item_id: string;
  user_product_id: string;
  family_id: string;
  title: string;
  category_id: string | null;
  listing_type_id: string;
  catalog_listing: boolean;
  catalog_product_id: string | null;
  has_wholesale: boolean;
  base_price: number;
  promo_price: number | null;
  sale_fee_amount: number;
  sale_fee_pct: number;
  shipping_cost_amount: number;
  free_shipping: boolean;
  shipping_mode_label: string;
  shipping_logistic_type: string;
  net_receive_amount: number;
  visits_7d: number;
  sales_7d: number;
  sales_30d: number;
  sold_quantity: number;
  conversion_rate_7d: number;
  health_score: number | null;
  pending_goals_count: number;
  recommendation_title: string | null;
  recommendation_action: string | null;
  status: "active" | "paused" | "under_review" | "closed";
  sub_status: string | null;
  permalink: string;
  thumbnail_url: string | null;
}

export interface MlFamilyDbRow {
  family_id: string;
  seller_id: string;
  is_official_family_id: boolean;
  title: string;
  thumbnail_url: string | null;
  status: string;
  last_synced_at: string;
}

export interface MlVariationDbRow {
  user_product_id: string;
  family_id: string;
  seller_id: string;
  variation_name: string;
  sku: string | null;
  thumbnail_url: string | null;
  available_quantity: number;
  mlbs_list: MlVariationMlbRef[] | null;
  last_synced_at: string;
}

export interface MlSaleOptionDbRow {
  item_id: string;
  user_product_id: string;
  family_id: string;
  seller_id: string;
  title: string;
  category_id: string | null;
  listing_type_id: string;
  catalog_listing: boolean;
  catalog_product_id: string | null;
  has_wholesale: boolean;
  base_price: number;
  promo_price: number | null;
  active_price: number;
  sale_fee_amount: number;
  sale_fee_pct: number;
  shipping_cost_amount: number;
  free_shipping: boolean;
  shipping_mode_label: string;
  shipping_logistic_type: string;
  net_receive_amount: number;
  visits_7d: number;
  sales_7d: number;
  sales_30d: number;
  sold_quantity: number;
  conversion_rate_7d: number;
  health_score: number | null;
  pending_goals_count: number;
  recommendation_title: string | null;
  recommendation_action: string | null;
  status: string;
  sub_status: string | null;
  permalink: string;
  thumbnail_url: string | null;
  last_synced_at: string;
}

export interface MlCatalogKpis {
  totalFamilies: number;
  totalVariations: number;
  totalSaleOptions: number;
  totalStock: number;
  totalVisits7d: number;
  totalSales7d: number;
  totalSales30d: number;
  overallConversion7d: number;
  avgNetReceive: number;
}
