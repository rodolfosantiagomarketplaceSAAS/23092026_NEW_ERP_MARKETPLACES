import { z } from "zod";

export const erpProductPhotoSchema = z.object({
  url: z.string().trim().min(1, "URL da foto inválida."),
  path: z.string().nullable().optional(),
  is_primary: z.boolean().optional(),
  alt: z.string().max(200).nullable().optional(),
});

export const upsertPpfRollSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, "Informe o código da bobina.").max(64),
  name: z.string().trim().min(2, "Informe o nome da bobina.").max(180),
  brand: z.string().trim().max(120).nullable().optional(),
  finish: z.string().trim().min(1).max(64).default("brilho"),
  thickness_microns: z.coerce.number().int().min(1).max(2000).nullable().optional(),
  roll_width_cm: z.coerce.number().positive("Largura da bobina deve ser maior que zero.").default(152),
  roll_length_m: z.coerce.number().positive("Comprimento da bobina deve ser maior que zero.").default(12),
  cost_per_linear_meter: z.coerce.number().min(0, "Custo por metro inválido.").default(220),
  default_waste_margin_pct: z.coerce.number().min(0).max(200).default(15),
  total_meters_purchased: z.coerce.number().min(0).optional(),
  remaining_meters: z.coerce.number().optional(),
  min_alert_meters: z.coerce.number().min(0).default(2),
  supplier: z.string().trim().max(160).nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  lot_number: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().default(true),
});

export const kitItemInputSchema = z.object({
  component_product_id: z.string().uuid("Componente do kit inválido."),
  quantity: z.coerce.number().positive("Quantidade do componente deve ser maior que zero."),
  notes: z.string().trim().max(240).nullable().optional(),
});

export const upsertErpProductSchema = z.object({
  id: z.string().uuid().optional(),
  product_type: z.enum(["simple", "ppf_piece", "kit"]).default("simple"),
  code: z.string().trim().min(1, "Informe o código do produto.").max(64),
  sku: z.string().trim().min(1, "Informe o SKU do produto.").max(80),
  ean: z.string().trim().max(32).nullable().optional(),
  name: z.string().trim().min(2, "Informe o nome do produto.").max(220),
  description: z.string().trim().max(4000).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  supplier: z.string().trim().max(160).nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  ncm: z.string().trim().max(20).nullable().optional(),
  unit: z.string().trim().min(1).max(16).default("UN"),
  status: z.enum(["active", "inactive", "draft"]).default("active"),
  cost_category: z
    .enum(["material", "packaging", "accessories", "printing", "logistics"])
    .default("material"),
  thumbnail_url: z.string().trim().nullable().optional(),
  photos: z.array(erpProductPhotoSchema).max(12).default([]),
  dimension_unit: z.enum(["mm", "cm"]).default("cm"),
  width: z.coerce.number().min(0).nullable().optional(),
  height: z.coerce.number().min(0).nullable().optional(),
  depth: z.coerce.number().min(0).nullable().optional(),
  weight_grams: z.coerce.number().min(0).default(0),
  uses_ppf_roll: z.boolean().default(false),
  ppf_roll_id: z.string().uuid().nullable().optional(),
  ppf_calc_mode: z.enum(["area", "linear"]).default("area"),
  ppf_waste_margin_pct: z.coerce.number().min(0).max(200).default(15),
  ppf_piece_count: z.coerce.number().int().min(1).max(1000).default(1),
  manual_cost: z.coerce.number().min(0).default(0),
  extra_cost: z.coerce.number().min(0).default(0),
  suggested_price: z.coerce.number().min(0).default(0),
  min_price: z.coerce.number().min(0).default(0),
  stock_quantity: z.coerce.number().default(0),
  min_stock_quantity: z.coerce.number().min(0).default(0),
  storage_location: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  kit_items: z.array(kitItemInputSchema).optional(),
});

export const upsertListingLinkSchema = z.object({
  id: z.string().uuid().optional(),
  platform: z.enum(["mercadolivre", "shopee", "outros"]).default("mercadolivre"),
  external_listing_id: z.string().trim().min(3, "Informe o código do anúncio (ex: MLB...).").max(80),
  listing_sku: z.string().trim().max(80).nullable().optional(),
  listing_title: z.string().trim().max(255).nullable().optional(),
  listing_thumbnail: z.string().trim().nullable().optional(),
  product_id: z.string().uuid("Selecione um produto ou kit válido."),
  quantity_per_sale: z.coerce.number().positive().default(1),
  auto_sync_cost_template: z.boolean().default(false),
  sync_now: z.boolean().default(false),
  apply_to_unedited_orders: z.boolean().default(false),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const stockMovementSchema = z.object({
  entity_type: z.enum(["product", "ppf_roll"]),
  product_id: z.string().uuid().nullable().optional(),
  ppf_roll_id: z.string().uuid().nullable().optional(),
  movement_type: z.enum(["in", "out", "adjustment"]),
  quantity: z.coerce.number().positive("Informe uma quantidade maior que zero."),
  reason: z.string().trim().max(300).nullable().optional(),
});

export const deductSalesStockSchema = z.object({
  dateFrom: z.string().trim().min(8).max(32),
  dateTo: z.string().trim().min(8).max(32),
  deductProducts: z.boolean().default(true),
  deductPpfRolls: z.boolean().default(true),
});

export const createPpfRollLotSchema = z.object({
  ppf_roll_id: z.string().uuid("Selecione uma bobina PPF válida."),
  supplier_id: z.string().uuid().nullable().optional(),
  supplier_name: z.string().trim().max(180).nullable().optional(),
  lot_code: z.string().trim().min(1, "Informe o código do lote.").max(80),
  invoice_number: z.string().trim().max(80).nullable().optional(),
  purchase_date: z.string().trim().min(8, "Informe a data da compra.").max(32),
  roll_width_cm: z.coerce.number().positive().optional(),
  initial_meters: z.coerce.number().positive("Informe a metragem da bobina comprada (> 0)."),
  total_purchase_cost: z.coerce.number().min(0, "Informe o valor pago pela bobina."),
  activate_immediately: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const ppfRollLotActionSchema = z.object({
  lot_id: z.string().uuid("Lote inválido."),
  action: z.enum(["exhaust", "activate", "adjust_meters"]),
  remaining_meters: z.coerce.number().min(0).optional(),
  reason: z.string().trim().max(300).nullable().optional(),
});

export const upsertSupplierSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, "Informe o código do fornecedor.").max(64),
  supplier_type: z
    .enum(["fornecedor", "fabricante", "distribuidor", "importador"])
    .default("fornecedor"),
  trade_name: z.string().trim().min(2, "Informe o nome fantasia / nome do fornecedor.").max(180),
  legal_name: z.string().trim().max(220).nullable().optional(),
  document_number: z.string().trim().max(32).nullable().optional(),
  state_registration: z.string().trim().max(40).nullable().optional(),
  logo_url: z.string().trim().max(1000).nullable().optional(),
  contact_name: z.string().trim().max(140).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(180).nullable().optional(),
  financial_email: z.string().trim().max(180).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  zip_code: z.string().trim().max(20).nullable().optional(),
  street: z.string().trim().max(200).nullable().optional(),
  street_number: z.string().trim().max(30).nullable().optional(),
  complement: z.string().trim().max(120).nullable().optional(),
  neighborhood: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(10).nullable().optional(),
  payment_terms: z.string().trim().max(160).nullable().optional(),
  lead_time_days: z.coerce.number().int().min(0).max(365).nullable().optional(),
  min_order_value: z.coerce.number().min(0).nullable().optional(),
  pix_key: z.string().trim().max(180).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().default(true),
});
