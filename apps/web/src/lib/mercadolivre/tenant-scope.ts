import type { AuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProductCostTemplate } from "@/types/ml-sales";

export function applyTenantFilter<T extends { eq: Function; is: Function }>(
  query: T,
  ctx: Pick<AuthContext, "userId" | "organizationId">
): T {
  return ctx.organizationId
    ? query.eq("organization_id", ctx.organizationId)
    : query.is("organization_id", null).eq("user_id", ctx.userId);
}

export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

export async function upsertTenantCostTemplate(
  ctx: Pick<AuthContext, "userId" | "organizationId">,
  payload: {
    mlb_id: string;
    sku?: string | null;
    material_cost?: number;
    packaging_cost?: number;
    logistics_cost?: number;
    printing_cost?: number;
    accessories_kit_cost?: number;
    default_tax_pct?: number;
    default_seller_id?: string | null;
  }
): Promise<ProductCostTemplate> {
  const admin = createSupabaseAdminClient();
  const normalizedMlb = payload.mlb_id.trim().toUpperCase();

  const existingQuery = applyTenantFilter(
    admin.from("product_cost_templates").select("*").eq("mlb_id", normalizedMlb),
    ctx
  );
  const { data: existing, error: selectErr } = await existingQuery.maybeSingle();
  if (selectErr) {
    throw new Error(selectErr.message);
  }

  if (existing) {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (payload.sku !== undefined) updateData.sku = payload.sku;
    if (payload.material_cost !== undefined) updateData.material_cost = payload.material_cost;
    if (payload.packaging_cost !== undefined) updateData.packaging_cost = payload.packaging_cost;
    if (payload.logistics_cost !== undefined) updateData.logistics_cost = payload.logistics_cost;
    if (payload.printing_cost !== undefined) updateData.printing_cost = payload.printing_cost;
    if (payload.accessories_kit_cost !== undefined) {
      updateData.accessories_kit_cost = payload.accessories_kit_cost;
    }
    if (payload.default_tax_pct !== undefined) updateData.default_tax_pct = payload.default_tax_pct;
    if (payload.default_seller_id !== undefined) {
      updateData.default_seller_id = payload.default_seller_id;
    }

    const { data, error } = await admin
      .from("product_cost_templates")
      .update(updateData)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Falha ao atualizar template de custo.");
    }
    return data as ProductCostTemplate;
  }

  const insertData = {
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    mlb_id: normalizedMlb,
    sku: payload.sku ?? null,
    material_cost: payload.material_cost ?? 0,
    packaging_cost: payload.packaging_cost ?? 0,
    logistics_cost: payload.logistics_cost ?? 0,
    printing_cost: payload.printing_cost ?? 0,
    accessories_kit_cost: payload.accessories_kit_cost ?? 0,
    default_tax_pct: payload.default_tax_pct ?? 4,
    default_seller_id: payload.default_seller_id ?? null,
  };

  const { data, error } = await admin
    .from("product_cost_templates")
    .insert(insertData)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Falha ao cadastrar template de custo.");
  }
  return data as ProductCostTemplate;
}

