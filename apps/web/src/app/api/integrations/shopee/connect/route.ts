import { NextRequest, NextResponse } from "next/server";
import { saveMarketplaceIntegration } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shopId, partnerId, partnerKey, accessToken, accountName } = body;

    if (!shopId && !partnerId) {
      return NextResponse.json(
        { success: false, error: "Informe o Shop ID ou as credenciais de parceiro da Shopee." },
        { status: 400 }
      );
    }

    const cleanShopId = (shopId || partnerId || "SHP_STORE").toString().trim();
    const storeName = accountName?.trim() || `Loja Shopee #${cleanShopId}`;

    const saved = await saveMarketplaceIntegration({
      platform: "shopee",
      account_name: storeName,
      seller_id: cleanShopId,
      access_token: (accessToken || partnerKey || "shopee_session_token").trim(),
      metadata: {
        partner_id: partnerId ? partnerId.trim() : null,
        shop_id: cleanShopId,
        integrated_via: partnerKey ? "partner_api" : "shop_token",
      },
    });

    return NextResponse.json({
      success: true,
      message: `Loja da Shopee (${saved.account_name}) conectada com sucesso!`,
      account: saved,
    });
  } catch (err: any) {
    console.error("Erro na conexão Shopee:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Falha ao conectar loja da Shopee." },
      { status: 400 }
    );
  }
}
