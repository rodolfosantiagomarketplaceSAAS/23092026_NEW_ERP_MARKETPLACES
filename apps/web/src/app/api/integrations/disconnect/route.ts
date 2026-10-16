import { NextRequest, NextResponse } from "next/server";
import { canManageIntegrations, getAuthContext } from "@/lib/auth/context";
import { disconnectMarketplaceAccount, logIntegrationAudit } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  if (!canManageIntegrations(ctx)) {
    return NextResponse.json({ success: false, error: "Sem permissão para gerenciar integrações." }, { status: 403 });
  }

  try {
    const { platform, integrationId, sellerId } = await req.json();

    if (platform !== "mercadolivre" && platform !== "shopee") {
      return NextResponse.json({ success: false, error: "Plataforma inválida para desconexão." }, { status: 400 });
    }

    const scope = { userId: ctx.userId, organizationId: ctx.organizationId };
    await disconnectMarketplaceAccount(scope, { platform, integrationId, sellerId });
    await logIntegrationAudit(scope, "marketplace_disconnected", { platform, integrationId, sellerId });

    return NextResponse.json({
      success: true,
      message: `Conta de ${platform === "mercadolivre" ? "Mercado Livre" : "Shopee"} desconectada com sucesso!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
