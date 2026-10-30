import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getMemoryStoreById,
  updateMemoryStore,
  deleteMemoryStore,
} from "@/lib/data/competitorStoresStore";
import { resolveRequestUser } from "@/lib/extension/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = getMemoryStoreById(id);
    if (!store) {
      return NextResponse.json({ error: "Loja concorrente não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: store });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro ao consultar loja" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { segment, is_following, store_name, notes } = body;

    const authUser = await resolveRequestUser(req);
    const supabase = createSupabaseAdminClient();

    const updated = updateMemoryStore(id, {
      ...(segment !== undefined ? { segment } : {}),
      ...(is_following !== undefined ? { is_following } : {}),
      ...(store_name !== undefined ? { store_name } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });

    if (!updated) {
      return NextResponse.json({ error: "Loja concorrente não encontrada." }, { status: 404 });
    }

    // Update in Supabase if exists
    try {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (segment !== undefined) updateData.segment = segment;
      if (is_following !== undefined) updateData.is_following = is_following;
      if (store_name !== undefined) updateData.store_name = store_name;
      if (notes !== undefined) updateData.notes = notes;

      await supabase.from("competitor_stores").update(updateData).eq("id", id);
    } catch (dbErr) {
      console.warn("[API Stores PATCH] DB note:", dbErr);
    }

    return NextResponse.json({
      success: true,
      message: "Dados do concorrente atualizados com sucesso!",
      data: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao atualizar concorrente" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteMemoryStore(id);

    try {
      const supabase = createSupabaseAdminClient();
      await supabase.from("competitor_store_listings").delete().eq("store_id", id);
      await supabase.from("competitor_stores").delete().eq("id", id);
    } catch (dbErr) {
      console.warn("[API Stores DELETE] DB note:", dbErr);
    }

    return NextResponse.json({
      success: true,
      message: "Loja concorrente e seus anúncios foram removidos.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao excluir concorrente" },
      { status: 500 }
    );
  }
}

