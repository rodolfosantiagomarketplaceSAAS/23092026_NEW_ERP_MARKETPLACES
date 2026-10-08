import { NextRequest, NextResponse } from "next/server";
import { disconnectMarketplaceAccount } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, sellerId } = body;

    if (!platform || (platform !== "mercadolivre" && platform !== "shopee")) {
      return NextResponse.json({ success: false, error: "Plataforma inválida para desconexão." }, { status: 400 });
    }

    await disconnectMarketplaceAccount({ platform, sellerId });

    return NextResponse.json({
      success: true,
      message: `Conta de ${platform === "mercadolivre" ? "Mercado Livre" : "Shopee"} desconectada com sucesso!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
