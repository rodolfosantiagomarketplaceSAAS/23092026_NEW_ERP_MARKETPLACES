import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRequestUser } from "@/lib/extension/auth";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const q = searchParams.get("q")?.trim();
    // Limite padrão expandido para 1000 anúncios (permite carregar catálogo completo)
    const limit = Math.min(parseInt(searchParams.get("limit") || "1000", 10), 2000);

    const supabaseAdmin = createSupabaseAdminClient();

    // 1. Identifica o usuário: via token da extensão (Bearer) ou cookies de sessão do ERP
    const authUser = await resolveRequestUser(req);
    let userId: string | null = authUser?.id ?? null;

    if (!userId) {
      try {
        const serverClient = createSupabaseServerClient();
        const { data: { user } } = await serverClient.auth.getUser();
        if (user) {
          userId = user.id;
        }
      } catch {
        // Ignora erro de cookie caso a chamada seja puramente de extensão externa
      }
    }

    // Fallback apenas em ambiente de desenvolvimento se não houver usuário identificado
    if (!userId && process.env.NODE_ENV !== "production") {
      try {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        userId = users?.users?.[0]?.id ?? null;
      } catch {
        userId = null;
      }
    }

    let query = supabaseAdmin
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
      .order("title", { ascending: true })
      .limit(limit);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (platform && platform !== "all") {
      query = query.eq("platform", platform);
    }

    if (q) {
      query = query.or(`title.ilike.%${q}%,external_id.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[api/my-listings] Erro ao consultar anúncios:", error);
      // Fallback mock somente se tabela não existir ou erro no banco inicial em dev
      if (process.env.NODE_ENV !== "production") {
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
        ].filter((i) => !platform || platform === "all" || i.platform === platform);

        return NextResponse.json({ success: true, items: fallback, total: fallback.length }, { headers: CORS_HEADERS });
      }
      return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
    }

    const formatted = (data || []).map((item) => {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        id: item.id,
        platform: item.platform,
        external_id: item.external_id,
        title: item.title,
        current_price: item.current_price,
        product_sku: prod?.sku || null,
        status: item.status,
      };
    });

    return NextResponse.json(
      {
        success: true,
        items: formatted,
        total: formatted.length,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}

