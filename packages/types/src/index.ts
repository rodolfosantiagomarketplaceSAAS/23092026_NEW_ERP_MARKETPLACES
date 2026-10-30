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
  original_price?: number | null;
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
  listing_type?: string | null;
  sale_fee_amount?: number | null;
  sale_fee_pct?: number | null;
  shipping_cost?: number | null;
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
    monitored_count?: number;
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
  listing_type: z.string().nullable().optional(),
  sale_fee_amount: z.number().nonnegative().nullable().optional(),
  sale_fee_pct: z.number().nonnegative().nullable().optional(),
  shipping_cost: z.number().nonnegative().nullable().optional(),
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

// ==============================================================================
// 5. PESQUISA DE MERCADO & BI ANALYTICS (MERCADO LIVRE & SHOPEE)
// ==============================================================================
export interface MarketSearchItem {
  id: string;
  platform: MarketplacePlatform;
  external_id: string;
  title: string;
  current_price: number;
  original_price: number | null;
  discount_pct: number | null;
  shipping_type: string;
  is_free_shipping: boolean;
  is_full_or_flex: boolean;
  promo_badge: string | null;
  campaign_type: string | null;
  listing_type: string;
  permalink: string;
  thumbnail_url: string | null;
  seller_name: string;
  seller_reputation: string | null;
  sales_count_approx: number;
  rating: number;
  reviews_count: number;
  is_already_monitored: boolean;
  matched_my_listing_id: string | null;
}

export interface MarketSearchPriceDistribution {
  range: string;
  count: number;
  percentage: number;
}

export interface MarketSearchTopSeller {
  seller_name: string;
  listings_count: number;
  avg_price: number;
  seller_reputation: string | null;
}

export interface MarketSearchAnalytics {
  total_found: number;
  analyzed_count: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  median_price: number;
  fast_shipping_pct: number;
  free_shipping_pct: number;
  campaign_pct: number;
  avg_rating: number;
  opportunity_score: number;
  opportunity_label: string;
  opportunity_insight: string;
  price_distribution: MarketSearchPriceDistribution[];
  top_sellers: MarketSearchTopSeller[];
}

export interface MarketSearchResponse {
  query: string;
  platform: MarketplacePlatform | "all";
  limit: number;
  analytics: MarketSearchAnalytics;
  items: MarketSearchItem[];
  needs_extension?: boolean;
}

export const importFromSearchSchema = z.object({
  platform: z.enum(["mercadolivre", "shopee"]),
  external_id: z.string().min(1),
  seller_name: z.string().default("Vendedor Desconhecido"),
  seller_reputation: z.string().nullable().optional(),
  title: z.string().min(1),
  current_price: z.number().positive(),
  original_price: z.number().positive().nullable().optional(),
  shipping_type: z.string().default("padrao"),
  promo_badge: z.string().nullable().optional(),
  permalink: z.string().min(1),
  thumbnail_url: z.string().nullable().optional(),
  sales_count_approx: z.number().int().nonnegative().optional().default(0),
  rating: z.number().min(0).max(5).optional().default(5.0),
  my_listing_id: z.string().nullable().optional(),
});

export type ImportFromSearchInput = z.infer<typeof importFromSearchSchema>;

// ==============================================================================
// 6. REPRICING DINÂMICO & SIMULADOR DE MARGEM LÍQUIDA REAL (UNIT ECONOMICS)
// ==============================================================================
export interface CostStructure {
  cmv: number;                         // Custo da Mercadoria Vendida (R$)
  custoEmbalagem?: number;             // Embalagem e insumos adicionais (R$)
  aliquotaImpostoPct?: number;         // Alíquota estimada (ex: 6% Simples Nacional)
  comissaoMarketplacePct?: number;     // Taxa de comissão do canal (ex: 12% ou 17%)
  tarifaFixaMarketplace?: number;      // Taxa fixa para pedidos de menor valor (ex: R$ 6.00)
  custoFreteMedio?: number;            // Custo de envio médio suportado pelo seller
  margemMinimaPct?: number;            // Margem líquida mínima tolerada (ex: 15%)
}

export interface SimulationResult {
  precoSugerido: number;
  lucroLiquidoReais: number;
  margemLiquidaPct: number;
  ehViavel: boolean;
  motivoInviabilidade?: string;
  precoPisoSugerido: number;
  detalhamento: {
    valorComissao: number;
    valorImposto: number;
    custoTotal: number;
  };
}

export type RepricingStrategy = "undercut" | "match" | "target_margin";
export type RepricingUnviableAction = "alert_only" | "set_floor";

export interface RepricingRule {
  id?: string;
  user_id?: string;
  my_listing_id: string;
  strategy: RepricingStrategy;
  difference_value: number;
  max_price?: number | null;
  min_price?: number | null;
  respect_min_margin: boolean;
  on_unviable: RepricingUnviableAction;
  is_auto_apply: boolean;
  created_at?: string;
  updated_at?: string;
}

export const repricingRuleSchema = z.object({
  my_listing_id: z.string().uuid("ID do anúncio inválido"),
  strategy: z.enum(["undercut", "match", "target_margin"]),
  difference_value: z.number().min(0.01).default(0.10),
  max_price: z.number().positive().nullable().optional(),
  min_price: z.number().positive().nullable().optional(),
  respect_min_margin: z.boolean().default(true),
  on_unviable: z.enum(["alert_only", "set_floor"]).default("alert_only"),
  is_auto_apply: z.boolean().default(false),
});

export type RepricingRuleInput = z.infer<typeof repricingRuleSchema>;

// ==============================================================================
// 7. ESPIÃO DE LOJAS & CONCORRENTES DO MERCADO LIVRE (STORE INTELLIGENCE)
// ==============================================================================
export interface CompetitorStore {
  id: string;
  user_id: string;
  platform: MarketplacePlatform;
  store_name: string;
  seller_id: string | null;
  seller_nickname: string | null;
  store_url: string;
  segment: string; // Ex: 'Acessórios Automotivos', 'Eletrônicos', 'Moda', 'Ferramentas'
  is_following: boolean;
  seller_reputation: SellerReputation | string;
  notes?: string | null;
  total_listings: number;
  total_sales_approx: number;
  avg_ticket: number;
  last_scraped_at: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitorStoreListing {
  id: string;
  store_id: string;
  user_id: string;
  platform: MarketplacePlatform;
  external_id: string; // MLB...
  title: string;
  current_price: number;
  original_price?: number | null;
  discount_pct?: number | null;
  sales_count_approx: number;
  listing_created_at?: string | null;
  is_new_listing?: boolean;
  shipping_type: ShippingBadge | string;
  is_full: boolean;
  is_free_shipping: boolean;
  promo_badge?: string | null;
  permalink: string;
  thumbnail_url?: string | null;
  rating: number;
  reviews_count: number;
  estimated_sale_fee?: number;
  estimated_net?: number;
  last_scraped_at: string;
  created_at: string;
  updated_at: string;
  // Campos auxiliares calculados para UI
  store_name?: string;
  store_segment?: string;
}

export const competitorStoreSyncItemSchema = z.object({
  external_id: z.string().min(1),
  title: z.string().min(1),
  current_price: z.number().positive(),
  original_price: z.number().positive().nullable().optional(),
  discount_pct: z.number().nullable().optional(),
  sales_count_approx: z.number().int().nonnegative().optional().default(0),
  listing_created_at: z.string().nullable().optional(),
  shipping_type: z.string().default("padrao"),
  is_full: z.boolean().default(false),
  is_free_shipping: z.boolean().default(false),
  promo_badge: z.string().nullable().optional(),
  permalink: z.string().min(1),
  thumbnail_url: z.string().nullable().optional(),
  rating: z.number().min(0).max(5).optional().default(5.0),
  reviews_count: z.number().int().nonnegative().optional().default(0),
  estimated_sale_fee: z.number().nonnegative().optional().default(0),
  estimated_net: z.number().nonnegative().optional().default(0),
});

export const competitorStoreSyncSchema = z.object({
  platform: z.enum(["mercadolivre", "shopee"]).default("mercadolivre"),
  store_name: z.string().min(1),
  seller_id: z.string().nullable().optional(),
  seller_nickname: z.string().nullable().optional(),
  store_url: z.string().min(1),
  segment: z.string().optional().default("Geral"),
  is_following: z.boolean().optional().default(true),
  seller_reputation: z.string().optional().default("platinum"),
  notes: z.string().nullable().optional(),
  items: z.array(competitorStoreSyncItemSchema),
});

export type CompetitorStoreSyncInput = z.infer<typeof competitorStoreSyncSchema>;
export type CompetitorStoreSyncItemInput = z.infer<typeof competitorStoreSyncItemSchema>;

export const cloneListingToCatalogSchema = z.object({
  competitor_listing_id: z.string().optional(),
  external_id: z.string().min(1),
  title: z.string().min(1),
  suggested_price: z.number().positive(),
  cost_price: z.number().nonnegative().optional().default(0),
  sku: z.string().min(1),
  platform: z.enum(["mercadolivre", "shopee"]).default("mercadolivre"),
  thumbnail_url: z.string().nullable().optional(),
  permalink: z.string().optional(),
  shipping_type: z.string().default("padrao"),
  listing_type: z.string().default("gold_special"),
  available_quantity: z.number().int().positive().default(10),
});

export type CloneListingToCatalogInput = z.infer<typeof cloneListingToCatalogSchema>;


