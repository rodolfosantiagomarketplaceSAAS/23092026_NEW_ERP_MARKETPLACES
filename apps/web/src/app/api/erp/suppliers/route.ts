import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter, isMissingTableError } from "@/lib/mercadolivre/tenant-scope";
import { upsertSupplierSchema } from "@/lib/validators/erp-products";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await applyTenantFilter(
    admin.from("erp_suppliers").select("*").order("trade_name", { ascending: true }),
    ctx
  );

  if (isMissingTableError(error)) {
    return NextResponse.json({
      success: true,
      schemaReady: false,
      suppliers: [],
    });
  }

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    schemaReady: true,
    suppliers: data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = upsertSupplierSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados do fornecedor inválidos." },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const admin = createSupabaseAdminClient();

  const payload = {
    code: d.code.trim().toUpperCase(),
    supplier_type: d.supplier_type,
    trade_name: d.trade_name.trim(),
    legal_name: d.legal_name?.trim() || null,
    document_number: d.document_number?.trim() || null,
    state_registration: d.state_registration?.trim() || null,
    logo_url: d.logo_url?.trim() || null,
    contact_name: d.contact_name?.trim() || null,
    phone: d.phone?.trim() || null,
    whatsapp: d.whatsapp?.trim() || null,
    email: d.email?.trim() || null,
    financial_email: d.financial_email?.trim() || null,
    website: d.website?.trim() || null,
    zip_code: d.zip_code?.trim() || null,
    street: d.street?.trim() || null,
    street_number: d.street_number?.trim() || null,
    complement: d.complement?.trim() || null,
    neighborhood: d.neighborhood?.trim() || null,
    city: d.city?.trim() || null,
    state: d.state?.trim().toUpperCase() || null,
    payment_terms: d.payment_terms?.trim() || null,
    lead_time_days: d.lead_time_days ?? null,
    min_order_value: d.min_order_value ?? null,
    pix_key: d.pix_key?.trim() || null,
    notes: d.notes?.trim() || null,
    active: d.active,
  };

  try {
    if (d.id) {
      const { data, error } = await applyTenantFilter(
        admin.from("erp_suppliers").update(payload).eq("id", d.id).select("*"),
        ctx
      ).single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: error?.message || "Erro ao atualizar fornecedor." },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, supplier: data });
    }

    const { data, error } = await admin
      .from("erp_suppliers")
      .insert({
        ...payload,
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: error?.message || "Erro ao cadastrar fornecedor." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, supplier: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar fornecedor.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Informe o ID do fornecedor." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await applyTenantFilter(
    admin.from("erp_suppliers").delete().eq("id", id),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
