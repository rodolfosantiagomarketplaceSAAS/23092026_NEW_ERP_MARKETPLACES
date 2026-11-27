import { z } from "zod";

export const syncSalesRequestSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    allSales: z.boolean().optional().default(false),
    sellerAccountId: z.string().optional(),
    analysisMode: z.enum(["order_date", "shipping_date"]).optional().default("order_date"),
    reconcileShippingDates: z.boolean().optional().default(false),
  })
  .refine(
    (data) =>
      data.allSales === true ||
      (typeof data.from === "string" &&
        data.from.length >= 10 &&
        typeof data.to === "string" &&
        data.to.length >= 10),
    {
      message: "Informe um intervalo de datas válido ou ative Todas as Vendas.",
    }
  );

export const createSellerSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do vendedor/sócio").max(100),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Cor HEX inválida (use formato #RRGGBB)")
    .default("#0284C7"),
  commission_pct: z.coerce.number().min(0).max(100).default(100),
  active: z.boolean().default(true),
});

export const updateSellerSchema = createSellerSchema.partial().extend({
  id: z.string().uuid("ID de vendedor inválido"),
});

export const upsertCostTemplateSchema = z.object({
  mlb_id: z
    .string()
    .trim()
    .min(4, "Informe um código MLB válido")
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "")),
  sku: z.string().trim().nullable().optional(),
  material_cost: z.coerce.number().min(0).default(0),
  packaging_cost: z.coerce.number().min(0).default(0),
  logistics_cost: z.coerce.number().min(0).default(0),
  printing_cost: z.coerce.number().min(0).default(0),
  accessories_kit_cost: z.coerce.number().min(0).default(0),
  default_tax_pct: z.coerce.number().min(0).max(100).default(4),
  default_seller_id: z.string().uuid().nullable().optional(),
  applyToExistingUnassigned: z.boolean().optional().default(false),
});

export const batchAssignOrdersSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um pedido"),
  assignedSellerId: z.string().uuid().nullable().optional(),
  updateSellerAssignment: z.boolean().default(false),
  markVerified: z.boolean().optional(),
  saveDefaultForMlb: z.string().trim().optional(),
  updateShippedAt: z.boolean().optional().default(false),
  shippedAt: z.string().trim().nullable().optional(),
  revertShippedAtToApi: z.boolean().optional().default(false),
});

export const updateOrderCostsSchema = z.object({
  tax_pct: z.coerce.number().min(0).max(100),
  cost_material: z.coerce.number().min(0),
  cost_packaging: z.coerce.number().min(0),
  cost_logistics: z.coerce.number().min(0),
  cost_printing: z.coerce.number().min(0),
  cost_accessories_kit: z.coerce.number().min(0),
  saveAsMlbTemplate: z.boolean().optional().default(false),
});
