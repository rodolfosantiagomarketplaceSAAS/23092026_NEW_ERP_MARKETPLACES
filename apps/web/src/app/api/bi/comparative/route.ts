import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import type {
  BiComparativeResponse,
  ComparativeListingGroup,
  CompetitorComparisonItem,
  CompetitivenessStatus,
  MarketplacePlatform,
} from "@crm/types";

// Mock Fallback de alta fidelidade para desenvolvimento local imediato caso o banco ainda esteja inicializando
const MOCK_COMPARATIVE_DATA: Record<MarketplacePlatform, ComparativeListingGroup[]> = {
  mercadolivre: [
    {
      my_listing: {
        id: "ml-001",
        user_id: "demo-user",
        product_id: "prod-001",
        platform: "mercadolivre",
        external_id: "MLB3492817263",
        title: "Teclado Mecânico Gamer Led RGB Switch Blue Anti-ghosting Pro",
        current_price: 199.90,
        permalink: "https://produto.mercadolivre.com.br/MLB-3492817263",
        thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_789123-MLA1-F.webp",
        shipping_type: "ml_full",
        listing_type: "premium",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_sku: "TECL-MECA-RGB",
        product_cost_price: 120.00,
      },
      lowest_competitor_price: 184.90,
      diff_brl: 15.00,
      diff_pct: 8.11,
      status: "LOSING",
      competitors: [
        {
          id: "comp-ml-101",
          external_id: "MLB9988776655",
          seller_name: "Mega Informática Store",
          seller_reputation: "platinum",
          title: "Teclado Gamer Mecânico RGB Switch Blue Gamer Pro Brasil",
          current_price: 184.90,
          original_price: 219.90,
          shipping_type: "ml_full",
          promo_badge: "Oferta do Dia",
          permalink: "https://produto.mercadolivre.com.br/MLB-9988776655",
          thumbnail_url: null,
          price_difference_brl: 15.00,
          price_difference_pct: 8.11,
          last_scraped_at: new Date().toISOString(),
        },
        {
          id: "comp-ml-102",
          external_id: "MLB5544332211",
          seller_name: "Tech Prime Oficial",
          seller_reputation: "gold",
          title: "Teclado Mecânico RGB Switch Azul Promoção Queima Estoque",
          current_price: 209.00,
          original_price: 229.00,
          shipping_type: "ml_flex",
          promo_badge: "Cupom 10%",
          permalink: "https://produto.mercadolivre.com.br/MLB-5544332211",
          thumbnail_url: null,
          price_difference_brl: -9.10,
          price_difference_pct: -4.35,
          last_scraped_at: new Date().toISOString(),
        },
      ],
    },
    {
      my_listing: {
        id: "ml-002",
        user_id: "demo-user",
        product_id: "prod-002",
        platform: "mercadolivre",
        external_id: "MLB2819201948",
        title: "Fone de Ouvido Bluetooth 5.3 Microfone Bateria 30h Top",
        current_price: 139.90,
        permalink: "https://produto.mercadolivre.com.br/MLB-2819201948",
        thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_654321-MLA2-F.webp",
        shipping_type: "ml_coleta",
        listing_type: "classico",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_sku: "FONE-BT-ANC",
        product_cost_price: 85.00,
      },
      lowest_competitor_price: 149.90,
      diff_brl: -10.00,
      diff_pct: -6.67,
      status: "WINNING",
      competitors: [
        {
          id: "comp-ml-201",
          external_id: "MLB1122334455",
          seller_name: "Audio World E-commerce",
          seller_reputation: "gold",
          title: "Fone Bluetooth Cancelamento de Ruído Bateria Longa Duração",
          current_price: 149.90,
          original_price: 169.90,
          shipping_type: "ml_correios",
          promo_badge: null,
          permalink: "https://produto.mercadolivre.com.br/MLB-1122334455",
          thumbnail_url: null,
          price_difference_brl: -10.00,
          price_difference_pct: -6.67,
          last_scraped_at: new Date().toISOString(),
        },
      ],
    },
    {
      my_listing: {
        id: "ml-003",
        user_id: "demo-user",
        product_id: null,
        platform: "mercadolivre",
        external_id: "MLB9876543210",
        title: "Mouse Gamer Óptico 12000 DPI 6 Botões Programáveis",
        current_price: 89.90,
        permalink: "https://produto.mercadolivre.com.br/MLB-9876543210",
        thumbnail_url: null,
        shipping_type: "ml_full",
        listing_type: "premium",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_sku: "MOUSE-GAMER-12K",
        product_cost_price: 45.00,
      },
      lowest_competitor_price: null,
      diff_brl: null,
      diff_pct: null,
      status: "UNMATCHED",
      competitors: [],
    },
  ],
  shopee: [
    {
      my_listing: {
        id: "shp-001",
        user_id: "demo-user",
        product_id: "prod-001",
        platform: "shopee",
        external_id: "SHP98127391.129381",
        title: "Teclado Gamer Mecânico Led RGB Switch Blue Original ABNT2",
        current_price: 189.90,
        permalink: "https://shopee.com.br/product/98127391/129381",
        thumbnail_url: null,
        shipping_type: "shopee_xpress",
        listing_type: "oficial",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_sku: "TECL-MECA-RGB",
        product_cost_price: 120.00,
      },
      lowest_competitor_price: 178.50,
      diff_brl: 11.40,
      diff_pct: 6.39,
      status: "LOSING",
      competitors: [
        {
          id: "comp-shp-001",
          external_id: "SHP77665544.887766",
          seller_name: "Gamer Zone Brasil",
          seller_reputation: "indicado",
          title: "Teclado Mecânico ABNT2 RGB Switch Blue Led Pronta Entrega",
          current_price: 178.50,
          original_price: 199.90,
          shipping_type: "shopee_frete_gratis",
          promo_badge: "Oferta Relâmpago",
          permalink: "https://shopee.com.br/product/77665544/887766",
          thumbnail_url: null,
          price_difference_brl: 11.40,
          price_difference_pct: 6.39,
          last_scraped_at: new Date().toISOString(),
        },
      ],
    },
    {
      my_listing: {
        id: "shp-002",
        user_id: "demo-user",
        product_id: "prod-002",
        platform: "shopee",
        external_id: "SHP55443322.990011",
        title: "Fone Bluetooth 5.3 Sem Fio Alta Fidelidade Graves Potentes",
        current_price: 119.00,
        permalink: "https://shopee.com.br/product/55443322/990011",
        thumbnail_url: null,
        shipping_type: "shopee_frete_gratis",
        listing_type: "padrao",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_sku: "FONE-BT-ANC",
        product_cost_price: 85.00,
      },
      lowest_competitor_price: 119.00,
      diff_brl: 0.00,
      diff_pct: 0.00,
      status: "TIED",
      competitors: [
        {
          id: "comp-shp-002",
          external_id: "SHP33221100.445566",
          seller_name: "Distribuidora Som & Tech",
          seller_reputation: "oficial",
          title: "Fone de Ouvido Sem Fio Bluetooth Graves Potentes Original",
          current_price: 119.00,
          original_price: 139.00,
          shipping_type: "shopee_xpress",
          promo_badge: "Cupom R$ 10",
          permalink: "https://shopee.com.br/product/33221100/445566",
          thumbnail_url: null,
          price_difference_brl: 0.00,
          price_difference_pct: 0.00,
          last_scraped_at: new Date().toISOString(),
        },
      ],
    },
  ],
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = (searchParams.get("platform") || "mercadolivre") as MarketplacePlatform;
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const statusFilter = searchParams.get("status") || "all";

    const supabase = createSupabaseAdminClient();

    // Consulta de anúncios próprios com produto vinculado
    const { data: myListings, error: myListingsError } = await supabase
      .from("my_listings")
      .select(`
        id,
        user_id,
        product_id,
        platform,
        external_id,
        title,
        current_price,
        permalink,
        thumbnail_url,
        shipping_type,
        listing_type,
        status,
        created_at,
        updated_at,
        products (
          sku,
          cost_price
        )
      `)
      .eq("platform", platform)
      .order("created_at", { ascending: false });

    // Se falhar ou não houver dados no banco, usa os dados de demonstração mockados
    let groups: ComparativeListingGroup[] = [];

    if (myListingsError || !myListings || myListings.length === 0) {
      groups = MOCK_COMPARATIVE_DATA[platform] || [];
    } else {
      // Para cada anúncio próprio, busca os concorrentes pareados via listing_matches
      for (const item of myListings) {
        const { data: matches } = await supabase
          .from("listing_matches")
          .select(`
            competitor_listing_id,
            competitor_listings (*)
          `)
          .eq("my_listing_id", item.id)
          .eq("is_active", true);

        const myPrice = Number(item.current_price);
        const competitors: CompetitorComparisonItem[] = [];
        let lowestPrice: number | null = null;

        if (matches && matches.length > 0) {
          for (const m of matches) {
            const comp = m.competitor_listings as any;
            if (!comp) continue;

            const compPrice = Number(comp.current_price);
            if (lowestPrice === null || compPrice < lowestPrice) {
              lowestPrice = compPrice;
            }

            const diffBrl = myPrice - compPrice;
            const diffPct = compPrice > 0 ? (diffBrl / compPrice) * 100 : 0;

            competitors.push({
              id: comp.id,
              external_id: comp.external_id,
              seller_name: comp.seller_name,
              seller_reputation: comp.seller_reputation,
              title: comp.title,
              current_price: compPrice,
              original_price: comp.original_price ? Number(comp.original_price) : null,
              shipping_type: comp.shipping_type,
              promo_badge: comp.promo_badge,
              permalink: comp.permalink,
              thumbnail_url: comp.thumbnail_url,
              price_difference_brl: Number(diffBrl.toFixed(2)),
              price_difference_pct: Number(diffPct.toFixed(2)),
              last_scraped_at: comp.last_scraped_at,
            });
          }
        }

        let status: CompetitivenessStatus = "UNMATCHED";
        let diffBrl: number | null = null;
        let diffPct: number | null = null;

        if (lowestPrice !== null) {
          diffBrl = Number((myPrice - lowestPrice).toFixed(2));
          diffPct = Number(((diffBrl / lowestPrice) * 100).toFixed(2));

          if (diffBrl < 0) {
            status = "WINNING"; // Nosso preço é mais baixo
          } else if (diffBrl === 0) {
            status = "TIED";
          } else {
            status = "LOSING"; // Concorrente tem preço menor
          }
        }

        const productData = Array.isArray(item.products) ? item.products[0] : item.products;

        groups.push({
          my_listing: {
            ...item,
            current_price: myPrice,
            product_sku: productData?.sku || null,
            product_cost_price: productData?.cost_price ? Number(productData.cost_price) : null,
          },
          competitors,
          lowest_competitor_price: lowestPrice,
          diff_brl: diffBrl,
          diff_pct: diffPct,
          status,
        });
      }
    }

    // Aplicação de Filtros em memória
    let filtered = groups;

    if (search) {
      filtered = filtered.filter((g) => {
        const titleMatch = g.my_listing.title.toLowerCase().includes(search);
        const skuMatch = g.my_listing.product_sku?.toLowerCase().includes(search) || false;
        const extMatch = g.my_listing.external_id.toLowerCase().includes(search);
        const compMatch = g.competitors.some(
          (c) =>
            c.title.toLowerCase().includes(search) ||
            c.seller_name.toLowerCase().includes(search) ||
            c.external_id.toLowerCase().includes(search)
        );
        return titleMatch || skuMatch || extMatch || compMatch;
      });
    }

    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((g) => g.status === statusFilter);
    }

    // Sumário consolidado de KPIs
    const summary = {
      total_listings: groups.length,
      winning_count: groups.filter((g) => g.status === "WINNING").length,
      tied_count: groups.filter((g) => g.status === "TIED").length,
      losing_count: groups.filter((g) => g.status === "LOSING").length,
      unmatched_count: groups.filter((g) => g.status === "UNMATCHED").length,
    };

    const responseData: BiComparativeResponse = {
      platform,
      summary,
      items: filtered,
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[API BI Comparative] Erro:", message);
    return NextResponse.json(
      { error: "Erro ao gerar comparativo de BI", details: message },
      { status: 500 }
    );
  }
}
