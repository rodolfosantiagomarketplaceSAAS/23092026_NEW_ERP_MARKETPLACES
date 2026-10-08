import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_APP_ID;
  const redirectUri = `${req.nextUrl.origin}/api/integrations/mercadolivre/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  if (!appId) {
    return NextResponse.json({
      success: false,
      hasOauthConfig: false,
      message: "Para conexão 1-clique via OAuth oficial, configure seu App ID ou utilize o modo de Conexão Assistida (Token de Acesso).",
    });
  }

  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}`;

  return NextResponse.json({
    success: true,
    hasOauthConfig: true,
    authUrl,
  });
}
