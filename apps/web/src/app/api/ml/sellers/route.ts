import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSellerSchema, updateSellerSchema } from "@/lib/validators/ml-sales";
import { applyTenantFilter } from "@/lib/mercadolivre/tenant-scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await applyTenantFilter(
    admin.from("sellers").select("*").order("name", { ascending: true }),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, sellers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = createSellerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("sellers")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      name: parsed.data.name,
      color_hex: parsed.data.color_hex,
      commission_pct: parsed.data.commission_pct,
      active: parsed.data.active,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao cadastrar vendedor." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, seller: data });
}

export async function PATCH(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = updateSellerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." },
      { status: 400 }
    );
  }

  const { id, ...fields } = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data, error } = await applyTenantFilter(
    admin.from("sellers").update(fields).eq("id", id).select("*"),
    ctx
  ).single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao atualizar vendedor." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, seller: data });
}

export async function DELETE(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const sellerId = request.nextUrl.searchParams.get("id");
  if (!sellerId) {
    return NextResponse.json(
      { success: false, error: "Informe o ID do vendedor." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await applyTenantFilter(
    admin.from("sellers").delete().eq("id", sellerId),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

