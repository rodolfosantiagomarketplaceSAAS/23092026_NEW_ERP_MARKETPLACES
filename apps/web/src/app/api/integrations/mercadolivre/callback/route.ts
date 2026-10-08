import { NextRequest, NextResponse } from "next/server";
import { validateMercadoLivreToken, saveMarketplaceIntegration } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const appId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_APP_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_SECRET_KEY;
  const redirectUri = `${req.nextUrl.origin}/api/integrations/mercadolivre/callback`;

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/configuracoes?tab=marketplaces&error=${encodeURIComponent(error || "Autorização cancelada")}`, req.url)
    );
  }

  try {
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: appId || "",
        client_secret: clientSecret || "",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Erro na troca de código OAuth ML:", errText);
      return NextResponse.redirect(
        new URL("/configuracoes?tab=marketplaces&error=Falha+ao+obter+token+Mercado+Livre", req.url)
      );
    }

    const tokenData = await tokenRes.json();
    const mlUser = await validateMercadoLivreToken(tokenData.access_token);

    await saveMarketplaceIntegration({
      platform: "mercadolivre",
      account_name: mlUser.account_name,
      seller_id: mlUser.seller_id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      metadata: {
        email: mlUser.email,
        permalink: mlUser.permalink,
        reputation: mlUser.reputation,
        user_id_ml: tokenData.user_id,
        scope: tokenData.scope,
      },
    });

    return NextResponse.redirect(
      new URL("/configuracoes?tab=marketplaces&success=ml_connected", req.url)
    );
  } catch (err: any) {
    console.error("Erro no callback ML:", err);
    return NextResponse.redirect(
      new URL(`/configuracoes?tab=marketplaces&error=${encodeURIComponent(err.message)}`, req.url)
    );
  }
}
