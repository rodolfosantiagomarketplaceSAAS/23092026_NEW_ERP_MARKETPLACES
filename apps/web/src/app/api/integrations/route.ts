import { NextResponse } from "next/server";
import { getMarketplaceIntegrations } from "@/lib/services/marketplaceIntegrations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const integrations = await getMarketplaceIntegrations();

    const ml = integrations.find((i) => i.platform === "mercadolivre");
    const shopee = integrations.find((i) => i.platform === "shopee");

    return NextResponse.json({
      success: true,
      mercadolivre: ml ? { connected: true, ...ml } : { connected: false, platform: "mercadolivre" },
      shopee: shopee ? { connected: true, ...shopee } : { connected: false, platform: "shopee" },
      all: integrations,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
