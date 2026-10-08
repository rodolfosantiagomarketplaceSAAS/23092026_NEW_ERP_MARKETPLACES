import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  BiComparativeResponse,
  ComparativeListingGroup,
  CompetitorComparisonItem,
  CompetitivenessStatus,
  MarketplacePlatform,
} from "@crm/types";

// Estado de demonstração e fallback compartilhado
export const MOCK_COMPARATIVE_DATA: Record<MarketplacePlatform, ComparativeListingGroup[]> = {
  mercadolivre: [
    {
      my_listing: {
        id: "ml-001",
        user_id: "demo-user",
        product_id: "prod-001",
        platform: "mercadolivre",
        external_id: "MLB3492817263",
        title: "Teclado Mecânico Gamer Led RGB Switch Blue Anti-ghosting Pro",
        current_price: 147.84,
        original_price: 168.00,
        permalink: "https://produto.mercadolivre.com.br/MLB-3492817263",
        thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_789123-MLA1-F.webp",
        shipping_type: "ml_full",
        listing_type: "premium",
        status: "active",
        created_at: "2023-06-10T12:00:00.000Z",
        updated_at: new Date().toISOString(),
        product_sku: "TECL-MECA-RGB",
        product_cost_price: 120.00,
        sales_count_approx: 850,
        listing_created_at: "2023-06-10T12:00:00.000Z",
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
          thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_789123-MLA1-F.webp",
          price_difference_brl: 15.00,
          price_difference_pct: 8.11,
          last_scraped_at: new Date().toISOString(),
          sales_count_approx: 1540,
          listing_created_at: "2023-04-12T10:00:00.000Z",
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
          thumbnail_url: "https://http2.mlstatic.com/D_NQ_NP_2X_789123-MLA1-F.webp",
          price_difference_brl: -9.10,
          price_difference_pct: -4.35,
          last_scraped_at: new Date().toISOString(),
          sales_count_approx: 320,
          listing_created_at: "2023-11-20T15:30:00.000Z",
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
        listing_type: "padrao",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_sku: "TECL-MECA-RGB",
        product_cost_price: 120.00,
      },
      lowest_competitor_price: 179.90,
      diff_brl: 10.00,
      diff_pct: 5.56,
      status: "LOSING",
      competitors: [
        {
          id: "comp-shp-001",
          external_id: "SHP12345678.876543",
          seller_name: "Loja Gamer Brasil Oficial",
          seller_reputation: "indicado",
          title: "Teclado Mecânico RGB Switch Azul Promoção Exclusiva",
          current_price: 179.90,
          original_price: 199.90,
          shipping_type: "shopee_xpress",
          promo_badge: "Oferta Relâmpago",
          permalink: "https://shopee.com.br/product/12345678/876543",
          thumbnail_url: null,
          price_difference_brl: 10.00,
          price_difference_pct: 5.56,
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

/**
 * Recalcula menor preço e status para um grupo de anúncios
 */
export function recalculateGroupStatus(group: ComparativeListingGroup): ComparativeListingGroup {
  if (!group.competitors || group.competitors.length === 0) {
    return {
      ...group,
      lowest_competitor_price: null,
      diff_brl: null,
      diff_pct: null,
      status: "UNMATCHED",
    };
  }

  const lowest = Math.min(...group.competitors.map((c) => c.current_price));
  const myPrice = group.my_listing.current_price;
  const diffBrl = Number((myPrice - lowest).toFixed(2));
  const diffPct = lowest > 0 ? Number(((diffBrl / lowest) * 100).toFixed(2)) : 0;
  const status: CompetitivenessStatus =
    diffBrl < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";

  return {
    ...group,
    lowest_competitor_price: lowest,
    diff_brl: diffBrl,
    diff_pct: diffPct,
    status,
  };
}

/**
 * Remove um concorrente pareado do monitoramento
 */
export async function removeCompetitorMatch(
  myListingId: string,
  competitorId: string,
  userId?: string | null
) {
  // 1. Deleta vinculação em listing_matches e o concorrente em competitor_listings no Supabase
  try {
    const supabase = createSupabaseAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(competitorId);

    // Remove primeiro de listing_matches se houver
    if (isUuid) {
      let matchQuery = supabase
        .from("listing_matches")
        .delete()
        .eq("competitor_listing_id", competitorId);
      if (userId) {
        matchQuery = matchQuery.eq("user_id", userId);
      }
      await matchQuery;
    }

    // Remove também da tabela competitor_listings para não retornar no Radar
    let compQuery = supabase.from("competitor_listings").delete();
    if (isUuid) {
      compQuery = compQuery.eq("id", competitorId);
    } else {
      compQuery = compQuery.eq("external_id", competitorId);
    }
    if (userId) {
      compQuery = compQuery.eq("user_id", userId);
    }
    const { error: compError } = await compQuery;
    if (compError) {
      console.warn("[removeCompetitorMatch] Erro ao deletar competitor_listings:", compError.message);
    }
  } catch (e) {
    console.warn("[removeCompetitorMatch] Erro de conexão Supabase:", e);
  }

  // 2. Atualiza estado em memória
  for (const plat of ["mercadolivre", "shopee"] as MarketplacePlatform[]) {
    MOCK_COMPARATIVE_DATA[plat] = MOCK_COMPARATIVE_DATA[plat]
      .filter((group) => group.my_listing.id !== `radar-${competitorId}` && group.my_listing.external_id !== competitorId)
      .map((group) => {
        if (!myListingId || group.my_listing.id === myListingId) {
          const filteredComps = group.competitors.filter(
            (c) => c.id !== competitorId && c.external_id !== competitorId
          );
          return recalculateGroupStatus({
            ...group,
            competitors: filteredComps,
          });
        }
        return group;
      })
      .filter((group) => group.my_listing.listing_type !== "radar" || group.competitors.length > 0);
  }

  return true;
}

/**
 * Remove um anúncio do monitoramento (seja radar ou anúncio próprio com concorrentes pareados)
 */
export async function removeMyListing(myListingId: string, userId?: string | null) {
  try {
    const supabase = createSupabaseAdminClient();

    // Se for um item de Radar (anúncio concorrente sem anúncio próprio pareado)
    if (myListingId.startsWith("radar-")) {
      const compId = myListingId.replace(/^radar-/, "");
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(compId);
      
      // Remove vínculos em listing_matches primeiro
      if (isUuid) {
        let matchQ = supabase.from("listing_matches").delete().eq("competitor_listing_id", compId);
        if (userId) matchQ = matchQ.eq("user_id", userId);
        await matchQ;
      }

      let query = supabase.from("competitor_listings").delete();
      if (isUuid) {
        query = query.eq("id", compId);
      } else {
        query = query.eq("external_id", compId);
      }
      if (userId) {
        query = query.eq("user_id", userId);
      }
      const { error } = await query;
      if (error) {
        console.warn("[removeMyListing - radar] Erro no Supabase:", error.message);
      }
    } else {
      // Se for anúncio próprio cadastrado em my_listings
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(myListingId);

      // Remove vínculos em listing_matches primeiro
      if (isUuid) {
        let matchQ = supabase.from("listing_matches").delete().eq("my_listing_id", myListingId);
        if (userId) matchQ = matchQ.eq("user_id", userId);
        await matchQ;
      }

      let query = supabase.from("my_listings").delete();
      if (isUuid) {
        query = query.eq("id", myListingId);
      } else {
        query = query.eq("external_id", myListingId);
      }
      if (userId) {
        query = query.eq("user_id", userId);
      }
      const { error } = await query;
      if (error) {
        console.warn("[removeMyListing] Erro no Supabase:", error.message);
      }
    }
  } catch (e) {
    console.warn("[removeMyListing] Erro de conexão Supabase:", e);
  }

  // 2. Remove do estado em memória
  for (const plat of ["mercadolivre", "shopee"] as MarketplacePlatform[]) {
    MOCK_COMPARATIVE_DATA[plat] = MOCK_COMPARATIVE_DATA[plat].filter(
      (g) => g.my_listing.id !== myListingId && !myListingId.includes(g.my_listing.external_id)
    );
  }

  return true;
}

/**
 * Adiciona ou atualiza concorrente pareado na memória
 */
export function addOrUpdateMockCompetitor(
  platform: MarketplacePlatform,
  myListingId: string | null,
  compData: any
) {
  if (!MOCK_COMPARATIVE_DATA[platform]) {
    MOCK_COMPARATIVE_DATA[platform] = [];
  }
  const groups = MOCK_COMPARATIVE_DATA[platform];
  let targetGroup = myListingId ? groups.find((g) => g.my_listing.id === myListingId) : null;

  // Se não foi vinculado a um anúncio próprio, procura se já existe grupo de radar com este external_id
  if (!targetGroup) {
    targetGroup = groups.find(
      (g) =>
        g.my_listing.external_id === compData.external_id ||
        g.competitors.some((c) => c.external_id === compData.external_id)
    ) || null;
  }

  // Se ainda não existir grupo (ex: usuário sem anúncios próprios cadastrados), cria um grupo no Radar
  if (!targetGroup) {
    const radarId = `radar-${compData.external_id || Date.now()}`;
    const cleanExt = (compData.external_id || "PROD").replace(/[^A-Z0-9]/gi, "").slice(-8);
    const newRadarGroup: ComparativeListingGroup = {
      my_listing: {
        id: radarId,
        user_id: "demo-user",
        product_id: null,
        platform,
        external_id: compData.external_id,
        title: `[Radar de Mercado] ${compData.title}`,
        current_price: compData.current_price,
        permalink: compData.permalink,
        thumbnail_url: compData.thumbnail_url || null,
        shipping_type: compData.shipping_type || "padrao",
        listing_type: "radar",
        status: "active",
        created_at: compData.listing_created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_sku: `RADAR-${cleanExt}`,
        product_cost_price: null,
        sales_count_approx: compData.sales_count_approx !== undefined ? compData.sales_count_approx : 0,
        listing_created_at: compData.listing_created_at || null,
      },
      lowest_competitor_price: compData.current_price,
      diff_brl: 0.00,
      diff_pct: 0.00,
      status: "TIED",
      competitors: [],
    };

    groups.unshift(newRadarGroup);
    targetGroup = newRadarGroup;
  }

  const myPrice = targetGroup.my_listing.current_price;
  const diffBrl = Number((myPrice - compData.current_price).toFixed(2));
  const diffPct =
    compData.current_price > 0
      ? Number(((diffBrl / compData.current_price) * 100).toFixed(2))
      : 0;

  const newComp: CompetitorComparisonItem = {
    id: compData.id || `comp-${Date.now()}`,
    external_id: compData.external_id,
    seller_name: compData.seller_name,
    seller_reputation: compData.seller_reputation || "comum",
    title: compData.title,
    current_price: compData.current_price,
    original_price: compData.original_price || null,
    shipping_type: compData.shipping_type || "padrao",
    promo_badge: compData.promo_badge || null,
    permalink: compData.permalink,
    thumbnail_url: compData.thumbnail_url || null,
    price_difference_brl: diffBrl,
    price_difference_pct: diffPct,
    last_scraped_at: new Date().toISOString(),
    sales_count_approx: compData.sales_count_approx !== undefined ? compData.sales_count_approx : 0,
    listing_created_at: compData.listing_created_at || null,
    created_at: compData.listing_created_at || new Date().toISOString(),
  };

  // Substitui se já existe ou adiciona no início
  const existingIndex = targetGroup.competitors.findIndex(
    (c) => c.external_id === newComp.external_id
  );
  if (existingIndex >= 0) {
    targetGroup.competitors[existingIndex] = newComp;
  } else {
    targetGroup.competitors.unshift(newComp);
  }

  const updated = recalculateGroupStatus(targetGroup);
  Object.assign(targetGroup, updated);
}
