import { z } from "zod";

export const competitorSyncSchema = z.object({
  platform: z.enum(["mercadolivre", "shopee"], {
    errorMap: () => ({ message: "A plataforma deve ser 'mercadolivre' ou 'shopee'" }),
  }),
  external_id: z.string().min(1, "O identificador externo do anúncio é obrigatório"),
  seller_name: z.string().default("Vendedor Desconhecido"),
  seller_reputation: z.string().nullable().optional(),
  title: z.string().min(1, "O título do anúncio é obrigatório"),
  current_price: z.number().positive("O preço atual deve ser maior que zero"),
  original_price: z.number().positive().nullable().optional(),
  shipping_type: z.string().default("padrao"),
  promo_badge: z.string().nullable().optional(),
  permalink: z.string().min(1, "A URL do anúncio é obrigatória").transform((url) => {
    if (url.startsWith("//")) return `https:${url}`;
    if (!url.startsWith("http://") && !url.startsWith("https://")) return `https://${url}`;
    return url;
  }),
  thumbnail_url: z
    .string()
    .nullable()
    .optional()
    .transform((url) => {
      if (!url || typeof url !== "string" || url.trim() === "") return null;
      if (url.startsWith("//")) return `https:${url}`;
      return url;
    }),
  sales_count_approx: z.number().int().nonnegative().optional().default(0),
  rating: z.number().min(0).max(5).optional().default(5.0),
  listing_created_at: z.string().nullable().optional(),
  my_listing_id: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
});

export type CompetitorSyncInput = z.infer<typeof competitorSyncSchema>;

