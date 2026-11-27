import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { applyTenantFilter } from "@/lib/mercadolivre/tenant-scope";
import { upsertListingLinkSchema } from "@/lib/validators/erp-products";
import { loadErpWorkspaceData, syncLinkCostsToSalesTemplate } from "@/lib/erp/erp-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const data = await loadErpWorkspaceData(ctx);
    const mlbParam = request.nextUrl.searchParams.get("mlb_id")?.trim().toUpperCase();

    if (mlbParam) {
      const link =
        data.links.find((l) => l.external_listing_id.toUpperCase() === mlbParam) ?? null;
      return NextResponse.json({
        success: true,
        schemaReady: data.schemaReady,
        link,
      });
    }

    return NextResponse.json({
      success: true,
      schemaReady: data.schemaReady,
      links: data.links,
      products: data.products,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao listar vínculos de anúncios.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = upsertListingLinkSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Dados do vínculo inválidos." },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const admin = createSupabaseAdminClient();
  const normalizedListingId = d.external_listing_id.trim().toUpperCase();

  try {
    // Verifica se já existe vínculo para esse anúncio + plataforma no tenant
    const { data: existing } = await applyTenantFilter(
      admin
        .from("erp_listing_links")
        .select("*")
        .eq("platform", d.platform)
        .ilike("external_listing_id", normalizedListingId),
      ctx
    ).maybeSingle();

    let savedId: string;
    const basePayload = {
      platform: d.platform,
      external_listing_id: normalizedListingId,
      listing_sku: d.listing_sku?.trim() || null,
      listing_title: d.listing_title?.trim() || null,
      listing_thumbnail: d.listing_thumbnail?.trim() || null,
      product_id: d.product_id,
      quantity_per_sale: d.quantity_per_sale,
      auto_sync_cost_template: d.auto_sync_cost_template,
      notes: d.notes?.trim() || null,
    };

    if (d.id || existing?.id) {
      const targetId = d.id || existing.id;
      const { data, error } = await applyTenantFilter(
        admin.from("erp_listing_links").update(basePayload).eq("id", targetId).select("id"),
        ctx
      ).single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: error?.message || "Erro ao atualizar vínculo do anúncio." },
          { status: 500 }
        );
      }
      savedId = data.id;
    } else {
      const { data, error } = await admin
        .from("erp_listing_links")
        .insert({
          ...basePayload,
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
        })
        .select("id")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: error?.message || "Erro ao vincular produto ao anúncio." },
          { status: 500 }
        );
      }
      savedId = data.id;
    }

    let syncResult = { templateUpdated: false, ordersUpdated: 0 };

    if (d.sync_now || d.auto_sync_cost_template) {
      const workspace = await loadErpWorkspaceData(ctx);
      const product = workspace.products.find((p) => p.id === d.product_id);
      if (product) {
        syncResult = await syncLinkCostsToSalesTemplate(ctx, {
          externalListingId: normalizedListingId,
          listingSku: d.listing_sku ?? null,
          quantityPerSale: d.quantity_per_sale,
          product,
          applyToUneditedOrders: d.apply_to_unedited_orders,
        });

        await admin
          .from("erp_listing_links")
          .update({ last_cost_synced_at: new Date().toISOString() })
          .eq("id", savedId);
      }
    }

    const refreshed = await loadErpWorkspaceData(ctx);
    const savedLink = refreshed.links.find((l) => l.id === savedId) ?? null;

    return NextResponse.json({
      success: true,
      link: savedLink,
      syncResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar vínculo com anúncio.";
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
    return NextResponse.json({ success: false, error: "Informe o ID do vínculo." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await applyTenantFilter(
    admin.from("erp_listing_links").delete().eq("id", id),
    ctx
  );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
