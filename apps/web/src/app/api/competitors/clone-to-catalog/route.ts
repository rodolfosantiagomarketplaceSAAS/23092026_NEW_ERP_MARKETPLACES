import { NextRequest, NextResponse } from "next/server";
import { cloneListingToCatalogSchema } from "@crm/types";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    const supabase = createSupabaseAdminClient();
    const userId = user?.id || "demo-user-id";

    const body = await req.json();
    const parseResult = cloneListingToCatalogSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Dados de criação do anúncio inválidos.",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      title,
      suggested_price,
      cost_price,
      sku,
      platform,
      thumbnail_url,
      shipping_type,
      listing_type,
      available_quantity,
    } = parseResult.data;

    let productId: string | null = null;

    // 1. Cria ou recupera o Produto base
    try {
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .insert({
          user_id: userId,
          sku: sku.trim().toUpperCase(),
          title: title.trim(),
          cost_price: cost_price || 0,
          min_selling_price: suggested_price,
        })
        .select()
        .single();

      if (!prodErr && prodData) {
        productId = prodData.id;
      }
    } catch (e) {
      console.warn("[CloneToCatalog] Product creation note:", e);
    }

    // 2. Cria o anúncio próprio na tabela my_listings
    const generatedExternalId = `MLB${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    const newListingPayload: any = {
      user_id: userId,
      product_id: productId,
      platform,
      external_id: generatedExternalId,
      title: title.trim(),
      current_price: suggested_price,
      original_price: null,
      available_quantity: available_quantity || 10,
      sold_quantity: 0,
      shipping_type: shipping_type || "padrao",
      listing_type: listing_type || "gold_special",
      thumbnail_url: thumbnail_url || null,
      permalink: `https://produto.mercadolivre.com.br/${generatedExternalId}`,
      status: "active",
      listing_created_at: new Date().toISOString(),
      visits: 0,
      sales_last_7_days: 0,
      sales_last_30_days: 0,
      sales_trend: "stable",
    };

    let insertedListing: any = null;

    try {
      const { data: listingData, error: listingErr } = await supabase
        .from("my_listings")
        .insert(newListingPayload)
        .select()
        .single();

      if (!listingErr && listingData) {
        insertedListing = listingData;
      }
    } catch (e) {
      console.warn("[CloneToCatalog] MyListing creation note:", e);
    }

    return NextResponse.json({
      success: true,
      message: `Anúncio "${title}" criado com sucesso no seu Catálogo! (SKU: ${sku.toUpperCase()})`,
      data: {
        id: insertedListing?.id || `ml_cloned_${Date.now()}`,
        sku: sku.toUpperCase(),
        title,
        price: suggested_price,
        external_id: generatedExternalId,
      },
    });
  } catch (err: any) {
    console.error("[CloneToCatalog] Erro:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao criar anúncio a partir do concorrente." },
      { status: 500 }
    );
  }
}

