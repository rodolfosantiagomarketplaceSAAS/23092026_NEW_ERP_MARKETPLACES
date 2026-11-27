import { NextRequest, NextResponse } from "next/server";
import { resolveUnifiedAuth } from "@/lib/auth/context";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { my_listing_id } = body;

    if (!my_listing_id) {
      return NextResponse.json({ error: "my_listing_id obrigatório." }, { status: 400 });
    }

    const result = await syncSingleMyListingPrice(String(my_listing_id), {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          reauthRequired: result.reauthRequired,
          error: result.error || "Falha ao sincronizar preço.",
        },
        { status: result.reauthRequired ? 401 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      current_price: result.current_price,
      original_price: result.original_price,
      message: "Preço e promoção atualizados com sucesso diretamente do Mercado Livre!",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
