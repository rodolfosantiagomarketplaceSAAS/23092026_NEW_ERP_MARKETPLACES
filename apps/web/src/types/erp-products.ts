export type ErpProductType = "simple" | "ppf_piece" | "kit";
export type ErpProductStatus = "active" | "inactive" | "draft";
export type ErpDimensionUnit = "mm" | "cm";
export type ErpPpfCalcMode = "area" | "linear";
export type ErpCostCategory =
  | "material"
  | "packaging"
  | "accessories"
  | "printing"
  | "logistics";

export type ErpSupplierType =
  | "fornecedor"
  | "fabricante"
  | "distribuidor"
  | "importador";

export interface ErpSupplier {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  code: string;
  supplier_type: ErpSupplierType;
  trade_name: string;
  legal_name: string | null;
  document_number: string | null;
  state_registration: string | null;
  logo_url: string | null;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  financial_email: string | null;
  website: string | null;
  zip_code: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  min_order_value: number | null;
  pix_key: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  linked_products_count?: number;
  linked_rolls_count?: number;
}

export interface ErpProductPhoto {
  url: string;
  path?: string | null;
  is_primary?: boolean;
  alt?: string | null;
}

export type ErpPpfRollLotStatus = "in_use" | "queued" | "exhausted" | "archived";

export interface ErpPpfRollLot {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  ppf_roll_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_ref?: ErpSupplier | null;
  lot_code: string;
  invoice_number: string | null;
  purchase_date: string;
  roll_width_cm: number;
  initial_meters: number;
  remaining_meters: number;
  total_purchase_cost: number;
  cost_per_linear_meter: number;
  cost_per_m2: number;
  status: ErpPpfRollLotStatus;
  queue_order: number;
  started_using_at: string | null;
  exhausted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErpOrderCostLotSummaryItem {
  lot_id: string | null;
  lot_code: string;
  roll_id: string;
  roll_code: string;
  supplier_id: string | null;
  supplier_name: string | null;
  meters: number;
  area_m2: number;
  unit_cost_per_meter: number;
  total_cost: number;
}

export interface ErpOrderRollConsumption {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  ml_order_id: number;
  order_date: string;
  mlb_id: string;
  product_id: string | null;
  ppf_roll_id: string | null;
  ppf_roll_lot_id: string | null;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  lot_code_snapshot: string | null;
  roll_code_snapshot: string | null;
  roll_name_snapshot: string | null;
  meters_consumed: number;
  area_m2_consumed: number;
  unit_cost_per_meter_snapshot: number;
  total_cost_snapshot: number;
  source_stage: "sync_estimate" | "deduction";
  created_at: string;
}

export interface ErpPpfRoll {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  code: string;
  name: string;
  brand: string | null;
  finish: string;
  thickness_microns: number | null;
  roll_width_cm: number;
  roll_length_m: number;
  cost_per_linear_meter: number;
  default_waste_margin_pct: number;
  total_meters_purchased: number;
  remaining_meters: number;
  min_alert_meters: number;
  supplier: string | null;
  supplier_id?: string | null;
  supplier_ref?: ErpSupplier | null;
  lot_number: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  lots?: ErpPpfRollLot[];
  active_lot?: ErpPpfRollLot | null;
  queued_lots_count?: number;
  total_queued_meters?: number;
}

export interface ErpProduct {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  product_type: ErpProductType;
  code: string;
  sku: string;
  ean: string | null;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  supplier: string | null;
  supplier_id?: string | null;
  supplier_ref?: ErpSupplier | null;
  ncm: string | null;
  unit: string;
  status: ErpProductStatus;
  cost_category: ErpCostCategory;
  thumbnail_url: string | null;
  photos: ErpProductPhoto[];
  dimension_unit: ErpDimensionUnit;
  width: number | null;
  height: number | null;
  depth: number | null;
  weight_grams: number;
  uses_ppf_roll: boolean;
  ppf_roll_id: string | null;
  ppf_calc_mode: ErpPpfCalcMode;
  ppf_waste_margin_pct: number;
  ppf_piece_count: number;
  ppf_area_m2: number;
  ppf_linear_meters: number;
  ppf_calculated_cost: number;
  manual_cost: number;
  extra_cost: number;
  total_cost: number;
  suggested_price: number;
  min_price: number;
  stock_quantity: number;
  min_stock_quantity: number;
  storage_location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErpKitItem {
  id: string;
  kit_product_id: string;
  component_product_id: string;
  quantity: number;
  sort_order: number;
  notes: string | null;
  component?: ErpProductWithSummary;
}

export interface ErpRollConsumptionSummary {
  roll_id: string;
  roll_code: string;
  roll_name: string;
  roll_width_cm: number;
  roll_length_m: number;
  cost_per_linear_meter: number;
  remaining_meters: number;
  linear_meters: number;
  area_m2: number;
  cost: number;
  rolls_fraction: number; // ex: 0.015 de uma bobina de 12m
}

export interface ErpCostBreakdownByCategory {
  material_cost: number;
  packaging_cost: number;
  accessories_kit_cost: number;
  printing_cost: number;
  logistics_cost: number;
  total_cost: number;
}

export interface ErpProductWithSummary extends ErpProduct {
  ppf_roll?: ErpPpfRoll | null;
  kit_items?: ErpKitItem[];
  computed_total_cost: number;
  computed_total_weight_grams: number;
  computed_total_ppf_meters: number;
  computed_total_ppf_area_m2: number;
  computed_cost_breakdown: ErpCostBreakdownByCategory;
  roll_consumptions: ErpRollConsumptionSummary[];
  linked_listings_count?: number;
}

export interface ErpListingLink {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  platform: "mercadolivre" | "shopee" | "outros";
  external_listing_id: string;
  listing_sku: string | null;
  listing_title: string | null;
  listing_thumbnail: string | null;
  product_id: string;
  quantity_per_sale: number;
  auto_sync_cost_template: boolean;
  last_cost_synced_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: ErpProductWithSummary | null;
}

export interface ErpStockMovement {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  entity_type: "product" | "ppf_roll";
  product_id: string | null;
  ppf_roll_id: string | null;
  ppf_roll_lot_id?: string | null;
  supplier_id?: string | null;
  movement_type: "in" | "out" | "adjustment" | "sale_deduction" | "sale_return";
  quantity_delta: number;
  balance_after: number;
  unit: string;
  unit_cost?: number | null;
  total_cost?: number | null;
  reference_order_id: number | null;
  reference_mlb_id: string | null;
  reason: string | null;
  created_at: string;
  product_name?: string | null;
  product_sku?: string | null;
  roll_name?: string | null;
  roll_code?: string | null;
  lot_code?: string | null;
}

export interface ErpSalesConsumptionItem {
  mlb_id: string;
  listing_title: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_type: ErpProductType;
  orders_count: number;
  units_sold: number;
  total_product_cost: number;
  total_ppf_meters: number;
  total_ppf_area_m2: number;
  pending_deduction_orders: number;
  roll_consumptions: ErpRollConsumptionSummary[];
}

export interface ErpOverviewResponse {
  success: boolean;
  schemaReady: boolean;
  suppliersSchemaReady?: boolean;
  lotsSchemaReady?: boolean;
  suppliers: ErpSupplier[];
  rolls: ErpPpfRoll[];
  rollLots?: ErpPpfRollLot[];
  products: ErpProductWithSummary[];
  links: ErpListingLink[];
  movements: ErpStockMovement[];
  kpis: {
    totalProducts: number;
    totalSimple: number;
    totalPpfPieces: number;
    totalKits: number;
    lowStockCount: number;
    totalRolls: number;
    totalRemainingRollMeters: number;
    lowRollCount: number;
    totalLinkedListings: number;
    totalSuppliers: number;
    inventoryValue: number;
  };
}
