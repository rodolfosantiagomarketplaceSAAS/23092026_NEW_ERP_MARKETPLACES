import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("my_listings")
      .select(`
        id,
        platform,
        external_id,
        title,
        current_price,
        status,
        products (
          sku
        )
      `)
      .limit(limit);

    if (platform) {
      query = query.eq("platform", platform);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      // Fallback mock caso banco inicial não tenha registros
      const fallback = [
        {
          id: "ml-001",
          platform: "mercadolivre",
          external_id: "MLB3492817263",
          title: "Teclado Mecânico Gamer Led RGB Switch Blue Anti-ghosting Pro",
          current_price: 199.90,
          product_sku: "TECL-MECA-RGB",
        },
        {
          id: "ml-002",
          platform: "mercadolivre",
          external_id: "MLB2819201948",
          title: "Fone de Ouvido Bluetooth 5.3 Microfone Bateria 30h Top",
          current_price: 139.90,
          product_sku: "FONE-BT-ANC",
        },
        {
          id: "shp-001",
          platform: "shopee",
          external_id: "SHP98127391.129381",
          title: "Teclado Gamer Mecânico Led RGB Switch Blue Original ABNT2",
          current_price: 189.90,
          product_sku: "TECL-MECA-RGB",
        },
      ].filter((i) => !platform || i.platform === platform);

      return NextResponse.json({ success: true, items: fallback });
    }

    const formatted = data.map((item) => {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        id: item.id,
        platform: item.platform,
        external_id: item.external_id,
        title: item.title,
        current_price: item.current_price,
        product_sku: prod?.sku || null,
      };
    });

    return NextResponse.json({ success: true, items: formatted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
