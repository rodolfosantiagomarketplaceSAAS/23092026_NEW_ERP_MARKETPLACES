import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveUnifiedAuth } from "@/lib/auth/context";
import {
  getMemoryStoreById,
  updateMemoryStore,
  deleteMemoryStore,
} from "@/lib/data/competitorStoresStore";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await params;
    let store: any = getMemoryStoreById(id, ctx.userId);
    if (!store) {
      const supabase = createSupabaseAdminClient();
      const { data } = await supabase
        .from("competitor_stores")
        .select("*")
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (data) store = data;
    }

    if (!store) {
      return NextResponse.json(
        { error: "Loja concorrente não encontrada na sua conta." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: store });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao consultar loja";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { segment, is_following, store_name, notes } = body;

    const supabase = createSupabaseAdminClient();

    let updated: any = updateMemoryStore(
      id,
      {
        ...(segment !== undefined ? { segment } : {}),
        ...(is_following !== undefined ? { is_following } : {}),
        ...(store_name !== undefined ? { store_name } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      ctx.userId
    );

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (segment !== undefined) updateData.segment = segment;
    if (is_following !== undefined) updateData.is_following = is_following;
    if (store_name !== undefined) updateData.store_name = store_name;
    if (notes !== undefined) updateData.notes = notes;

    const { data: dbUpdated } = await supabase
      .from("competitor_stores")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select()
      .maybeSingle();

    if (dbUpdated) {
      updated = dbUpdated;
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Loja concorrente não encontrada na sua conta." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Dados do concorrente atualizados com sucesso!",
      data: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar concorrente";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await params;
    deleteMemoryStore(id, ctx.userId);

    const supabase = createSupabaseAdminClient();
    await supabase
      .from("competitor_store_listings")
      .delete()
      .eq("store_id", id)
      .eq("user_id", ctx.userId);

    await supabase
      .from("competitor_stores")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId);

    return NextResponse.json({
      success: true,
      message: "Loja concorrente e seus anúncios foram removidos.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao excluir concorrente";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
