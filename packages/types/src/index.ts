import { z } from "zod";

// ==============================================================================
// 1. ENUMS E LITERAIS
// ==============================================================================
export type MarketplacePlatform = "mercadolivre" | "shopee";

export type ListingStatus = "active" | "paused" | "closed";

export type ShippingBadge =
  | "ml_full"
  | "ml_flex"
  | "ml_coleta"
  | "ml_correios"
  | "shopee_xpress"
  | "shopee_padrao"
  | "shopee_frete_gratis"
  | "outros";

export type SellerReputation =
  | "platinum"
  | "gold"
  | "lider"
  | "oficial"
  | "indicado"
  | "comum";

export type CompetitivenessStatus =
  | "WINNING"     // Nosso preço é menor que o menor concorrente
  | "TIED"        // Empatado no menor preço
  | "LOSING"      // Concorrente tem preço menor
  | "UNMATCHED";  // Sem concorrentes vinculados para comparar

// ==============================================================================
// 2. MODELOS DE ENTIDADES DE BANCO DE DADOS
// ==============================================================================
export interface Product {
  id: string;
  user_id: string;
  sku: string;
  title: string;
  cost_price: number;
  min_selling_price: number;
  created_at: string;
  updated_at: string;
}

export interface MyListing {
  id: string;
  user_id: string;
  product_id: string | null;
  platform: MarketplacePlatform;
  external_id: string;
  title: string;
  current_price: number;
  permalink: string;
  thumbnail_url: string | null;
  shipping_type: ShippingBadge | string;
  listing_type: string;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  sales_count_approx?: number;
  listing_created_at?: string | null;
}

export interface CompetitorListing {
  id: string;
  user_id: string;
  platform: MarketplacePlatform;
  external_id: string;
  seller_name: string;
  seller_reputation: SellerReputation | string | null;
  title: string;
  current_price: number;
  original_price: number | null;
  shipping_type: ShippingBadge | string;
  promo_badge: string | null;
  permalink: string;
  thumbnail_url: string | null;
  sales_count_approx: number;
  rating: number;
  last_scraped_at: string;
  created_at: string;
  updated_at: string;
  listing_created_at?: string | null;
}

export interface ListingMatch {
  id: string;
  user_id: string;
  my_listing_id: string;
  competitor_listing_id: string;
  is_active: boolean;
  created_at: string;
}

export interface PriceHistory {
  id: string;
  competitor_listing_id: string;
  price: number;
  recorded_at: string;
}

// ==============================================================================
// 3. ESTRUTURA PARA COMPARAÇÃO DE BI (1 ANÚNCIO PRÓPRIO -> N CONCORRENTES)
// ==============================================================================
export interface CompetitorComparisonItem {
  id: string;
  external_id: string;
  seller_name: string;
  seller_reputation: string | null;
  title: string;
  current_price: number;
  original_price: number | null;
  shipping_type: string;
  promo_badge: string | null;
  permalink: string;
  thumbnail_url: string | null;
  price_difference_brl: number; // my_price - competitor_price
  price_difference_pct: number; // ((my_price - competitor_price) / competitor_price) * 100
  last_scraped_at: string;
  sales_count_approx?: number;
  listing_created_at?: string | null;
  created_at?: string;
}

export interface ComparativeListingGroup {
  my_listing: MyListing & {
    product_sku: string | null;
    product_cost_price: number | null;
  };
  competitors: CompetitorComparisonItem[];
  lowest_competitor_price: number | null;
  diff_brl: number | null; // Meu Preço - Menor Preço Concorrente (positivo = mais caro; negativo = mais barato)
  diff_pct: number | null;
  status: CompetitivenessStatus;
}

export interface BiComparativeResponse {
  platform: MarketplacePlatform;
  summary: {
    total_listings: number;
    winning_count: number;
    tied_count: number;
    losing_count: number;
    unmatched_count: number;
    radar_count?: number;
  };
  items: ComparativeListingGroup[];
}

// ==============================================================================
// 4. ESQUEMA DE VALIDAÇÃO ZOD & DTOs DE EXTRAÇÃO DA EXTENSÃO
// ==============================================================================
export const competitorSyncSchema = z.object({
  platform: z.enum(["mercadolivre", "shopee"]),
  external_id: z.string().min(1, "O ID externo do anúncio é obrigatório"),
  seller_name: z.string().default("Vendedor Desconhecido"),
  seller_reputation: z.string().nullable().optional(),
  title: z.string().min(1, "O título do anúncio é obrigatório"),
  current_price: z.number().positive("O preço atual deve ser maior que zero"),
  original_price: z.number().positive().nullable().optional(),
  shipping_type: z.string().default("padrao"),
  promo_badge: z.string().nullable().optional(),
  permalink: z.string().min(1, "A URL do anúncio deve ser válida"),
  thumbnail_url: z.string().nullable().optional(),
  sales_count_approx: z.number().int().nonnegative().optional().default(0),
  rating: z.number().min(0).max(5).optional().default(5.0),
  listing_created_at: z.string().nullable().optional(),
  my_listing_id: z.string().nullable().optional(),
});

export type CompetitorSyncInput = z.infer<typeof competitorSyncSchema>;

export interface CompetitorSyncResponse {
  success: boolean;
  message: string;
  competitor_listing: CompetitorListing;
  matched_to_my_listing: boolean;
  my_listing_id?: string | null;
}
