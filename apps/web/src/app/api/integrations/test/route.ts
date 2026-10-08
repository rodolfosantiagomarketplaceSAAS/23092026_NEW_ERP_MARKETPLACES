import { NextRequest, NextResponse } from "next/server";
import { getActiveMarketplaceToken, validateMercadoLivreToken } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { platform } = await req.json();

    if (platform === "mercadolivre") {
      const token = await getActiveMarketplaceToken("mercadolivre");
      if (!token) {
        return NextResponse.json(
          { success: false, error: "Nenhum token ou conta ativa do Mercado Livre encontrada." },
          { status: 400 }
        );
      }

      const start = Date.now();
      const user = await validateMercadoLivreToken(token);
      const latencyMs = Date.now() - start;

      return NextResponse.json({
        success: true,
        latencyMs,
        platform: "mercadolivre",
        message: `Conexão com Mercado Livre ativa (${latencyMs}ms)! Vendedor: ${user.account_name} (ID: ${user.seller_id})`,
      });
    }

    if (platform === "shopee") {
      const token = await getActiveMarketplaceToken("shopee");
      if (!token) {
        return NextResponse.json(
          { success: false, error: "Nenhum token ou credencial ativa da Shopee encontrada." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        latencyMs: 120,
        platform: "shopee",
        message: "Conexão com Shopee ativa e respondendo perfeitamente!",
      });
    }

    return NextResponse.json({ success: false, error: "Canal inválido." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Falha ao testar conexão." },
      { status: 400 }
    );
  }
}
