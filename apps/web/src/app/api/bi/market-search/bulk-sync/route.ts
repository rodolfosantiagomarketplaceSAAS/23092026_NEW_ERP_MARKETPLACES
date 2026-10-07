import { NextRequest, NextResponse } from "next/server";
import { saveSyncedSearch } from "@/lib/data/marketSearchStore";
import type { MarketSearchItem } from "@crm/types";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, platform, items } = body;

    if (!query || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Dados inválidos. 'query' e 'items' são obrigatórios." },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const cleanPlatform = (platform === "shopee" ? "shopee" : "mercadolivre") as "mercadolivre" | "shopee";

    // Salva no store compartilhado do ERP
    saveSyncedSearch(query, cleanPlatform, items as MarketSearchItem[]);

    return NextResponse.json(
      {
        success: true,
        message: `${items.length} anúncios da pesquisa foram sincronizados com sucesso no ERP!`,
        count: items.length,
        query,
        platform: cleanPlatform,
        redirectUrl: `/inteligencia?q=${encodeURIComponent(query)}&platform=${cleanPlatform}`,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Erro no bulk-sync de pesquisa de mercado:", error);
    return NextResponse.json(
      { error: "Falha ao sincronizar pesquisa", details: error?.message },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
