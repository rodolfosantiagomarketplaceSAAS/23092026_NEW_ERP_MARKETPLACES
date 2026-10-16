import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { getMercadoLivreConfig } from "@/lib/integrations/mercadolivre/oauth";
import { getMarketplaceIntegrations } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });

  try {
    const integrations = await getMarketplaceIntegrations({ userId: ctx.userId, organizationId: ctx.organizationId });
    const mlAccounts = integrations.filter((i) => i.platform === "mercadolivre");
    const shopee = integrations.find((i) => i.platform === "shopee");

    return NextResponse.json({
      success: true,
      mercadolivre: {
        connected: mlAccounts.some((a) => a.status === "online"),
        oauthConfigured: Boolean(getMercadoLivreConfig()),
        accounts: mlAccounts,
      },
      shopee: shopee ? { connected: true, ...shopee } : { connected: false, platform: "shopee" },
      all: integrations,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Falha ao carregar integrações." }, { status: 500 });
  }
}
