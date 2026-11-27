import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveUnifiedAuth } from "@/lib/auth/context";
import { sanitizePostgrestFilterValue } from "@/lib/security/url-validator";

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
    const ctx = await resolveUnifiedAuth(req);
    if (!ctx) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const safeQ = sanitizePostgrestFilterValue(searchParams.get("q"), 100);
    const limit = Math.min(parseInt(searchParams.get("limit") || "1000", 10), 2000);

    const supabaseAdmin = createSupabaseAdminClient();

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
      .eq("user_id", ctx.userId)
      .order("title", { ascending: true })
      .limit(limit);

    if (platform && platform !== "all") {
      query = query.eq("platform", platform);
    }

    if (safeQ) {
      query = query.or(`title.ilike.%${safeQ}%,external_id.ilike.%${safeQ}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[api/my-listings] Erro ao consultar anúncios:", error.message);
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
