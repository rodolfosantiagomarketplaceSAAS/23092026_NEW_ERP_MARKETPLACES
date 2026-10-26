import { NextRequest, NextResponse } from "next/server";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { my_listing_id } = body;

    if (!my_listing_id) {
      return NextResponse.json({ error: "my_listing_id obrigatório." }, { status: 400 });
    }

    const result = await syncSingleMyListingPrice(my_listing_id);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Falha ao sincronizar preço." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      current_price: result.current_price,
      original_price: result.original_price,
      message: "Preço e promoção atualizados com sucesso diretamente do Mercado Livre!",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
  }
}
