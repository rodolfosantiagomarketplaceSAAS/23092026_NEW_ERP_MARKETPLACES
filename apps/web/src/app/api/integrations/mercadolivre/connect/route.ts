import { NextRequest, NextResponse } from "next/server";
import { validateMercadoLivreToken, saveMarketplaceIntegration } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, appId, secretKey, accountName } = body;

    if (!accessToken && !appId) {
      return NextResponse.json(
        { success: false, error: "Informe o Token de Acesso ou suas credenciais de aplicação do Mercado Livre." },
        { status: 400 }
      );
    }

    let tokenToUse = accessToken ? accessToken.trim() : null;

    // Se forneceu appId e secretKey mas não token, tenta gerar client_credentials se aplicável
    if (!tokenToUse && appId && secretKey) {
      try {
        const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: appId.trim(),
            client_secret: secretKey.trim(),
          }),
        });

        if (tokenRes.ok) {
          const tokenJson = await tokenRes.json();
          tokenToUse = tokenJson.access_token;
        }
      } catch (e) {
        console.warn("Falha ao obter client_credentials:", e);
      }
    }

    if (!tokenToUse) {
      return NextResponse.json(
        { success: false, error: "Não foi possível validar as credenciais. Cole seu Access Token diretamente." },
        { status: 400 }
      );
    }

    // Valida o token chamando /users/me na API oficial do Mercado Livre
    const mlUser = await validateMercadoLivreToken(tokenToUse);

    const saved = await saveMarketplaceIntegration({
      platform: "mercadolivre",
      account_name: accountName?.trim() || mlUser.account_name,
      seller_id: mlUser.seller_id,
      access_token: tokenToUse,
      metadata: {
        email: mlUser.email,
        permalink: mlUser.permalink,
        reputation: mlUser.reputation,
        app_id: appId ? appId.trim() : null,
        country_id: mlUser.country_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Conta do Mercado Livre (${saved.account_name}) conectada com sucesso!`,
      account: saved,
    });
  } catch (err: any) {
    console.error("Erro na conexão Mercado Livre:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Falha ao validar conta com o Mercado Livre." },
      { status: 400 }
    );
  }
}
