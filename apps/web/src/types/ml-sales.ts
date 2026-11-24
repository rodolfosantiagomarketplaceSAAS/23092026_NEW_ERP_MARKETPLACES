export type MlSaleOrderStatus =
  | "paid"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export interface Seller {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  name: string;
  color_hex: string;
  commission_pct: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductCostTemplate {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  mlb_id: string;
  sku: string | null;
  material_cost: number;
  packaging_cost: number;
  logistics_cost: number;
  printing_cost: number;
  accessories_kit_cost: number;
  default_tax_pct: number;
  default_seller_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MlSaleOrder {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  ml_order_id: number;
  ml_pack_id: number | null;
  ml_shipment_id: number | null;
  ml_seller_id: string | null;
  store_name: string;
  order_date: string;
  shipping_deadline: string | null;
  status: MlSaleOrderStatus;
  cancellation_reason: string | null;

  mlb_id: string;
  sku: string | null;
  product_title: string;
  product_thumbnail: string | null;
  permalink: string | null;
  quantity: number;
  buyer_name: string;
  buyer_document: string | null;
  is_business_buyer: boolean;

  assigned_seller_id: string | null;
  verified_at: string | null;
  costs_manually_edited: boolean;

  gross_sale_amount: number;
  ml_commission_pct: number;
  ml_commission_amount: number;
  ml_shipping_cost: number;
  ml_promo_rebate: number;
  mp_net_released: number;
  mp_release_date: string | null;
  mp_release_status: string | null;

  tax_pct: number;
  tax_amount: number;
  cost_material: number;
  cost_packaging: number;
  cost_logistics: number;
  cost_printing: number;
  cost_accessories_kit: number;

  seller_transfer_profit: number;
  net_operational_profit: number;

  created_at: string;
  updated_at: string;
}

export interface MlSalesSummaryKpis {
  valid_orders_count: number;
  cancelled_orders_count: number;
  unverified_orders_count: number;
  unassigned_orders_count: number;
  gross_valid_sales: number;
  seller_transfer_base_total: number;
  effective_seller_transfer_total: number;
  ml_commission_total: number;
  ml_shipping_total: number;
  ml_promo_rebate_total: number;
  ml_net_platform_discount: number;
  tax_total: number;
  operational_costs_total: number;
  net_operational_profit_total: number;
  net_margin_pct: number;
}

export interface SellerTransferSummary {
  seller_id: string;
  name: string;
  color_hex: string;
  commission_pct: number;
  active: boolean;
  total_orders_in_period: number;
  valid_orders_count: number;
  base_transfer_total: number;
  effective_transfer_total: number;
  mp_released_amount: number;
  mp_pending_amount: number;
}

export interface DailyClosingRow {
  date_key: string; // YYYY-MM-DD (America/Sao_Paulo)
  date_label: string; // DD/MM/AAAA
  valid_orders_count: number;
  cancelled_orders_count: number;
  gross_sale_total: number;
  net_ml_fees_and_shipping: number;
  seller_transfers: Record<string, number>; // seller_id -> effective transfer R$
  unassigned_transfer_total: number;
  operational_costs_and_tax_total: number;
  net_operational_profit_total: number;
}

export interface MlConnectedAccountOption {
  id: string;
  seller_id: string;
  account_name: string;
  status: "online" | "expired" | "reauth_required";
}

export interface MlSalesDashboardResponse {
  success: boolean;
  schemaReady: boolean;
  orders: MlSaleOrder[];
  sellers: Seller[];
  templates: ProductCostTemplate[];
  accounts: MlConnectedAccountOption[];
  stores: string[];
  sellerOrderCounts: Record<string, number>;
  unassignedCount: number;
  kpis: MlSalesSummaryKpis;
  sellerSummaries: SellerTransferSummary[];
  dailyClosing: DailyClosingRow[];
}

export interface MlSalesSyncSummary {
  success: boolean;
  accountsSynced: number;
  ordersFetched: number;
  ordersUpserted: number;
  errors: Array<{ account: string; message: string }>;
}

