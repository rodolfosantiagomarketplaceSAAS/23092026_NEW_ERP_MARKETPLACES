import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { syncSingleMyListingPrice } from "@/lib/services/listingPriceSync";
import { resolveRequestUser } from "@/lib/extension/auth";
import { MOCK_COMPARATIVE_DATA, recalculateGroupStatus } from "@/lib/data/comparativeStore";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Normaliza strings de preço (Ex: "R$ 146,28" -> 146.28)
 */
function parsePrice(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const str = String(val).replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Extrai o ID MLB do Mercado Livre de URLs ou strings externas
 */
function extractMlbId(rawIdOrUrl?: string | null): string | null {
  if (!rawIdOrUrl) return null;
  const match = rawIdOrUrl.match(/MLB-?(\d+)/i);
  if (match) return `MLB${match[1]}`;
  const numMatch = rawIdOrUrl.match(/(\d{8,14})/);
  if (numMatch) return `MLB${numMatch[1]}`;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const authUser = await resolveRequestUser(req);
    let userId: string | null = authUser?.id ?? null;

    if (!userId && process.env.NODE_ENV !== "production") {
      try {
        const { data: users } = await supabase.auth.admin.listUsers();
        userId = users?.users?.[0]?.id ?? null;
      } catch {
        userId = null;
      }
    }

    const body = await req.json().catch(() => ({}));
    const {
      my_listing_id,
      competitor_id,
      competitor_permalink,
      competitor_external_id,
      platform = "mercadolivre",
      verified_data,
    } = body;

    if (!my_listing_id) {
      return NextResponse.json(
        { error: "my_listing_id é obrigatório." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Sincroniza e confere o anúncio próprio via API Oficial do Mercado Livre (/items, /sale_price, /seller-promotions)
    let myListingPriceResult: any = null;
    try {
      myListingPriceResult = await syncSingleMyListingPrice(my_listing_id);
    } catch (errSync) {
      console.warn("[refresh-comparison] Aviso ao sincronizar preço próprio:", errSync);
    }

    // Busca dados atualizados do anúncio próprio
    let myListingData: any = null;
    if (userId) {
      const { data: ml } = await supabase
        .from("my_listings")
        .select("*")
        .eq("id", my_listing_id)
        .maybeSingle();
      myListingData = ml;
    }

    // Fallback para mock store se não encontrar no Supabase
    if (!myListingData) {
      const platKey = (platform as "mercadolivre" | "shopee") || "mercadolivre";
      const groupInMock = MOCK_COMPARATIVE_DATA[platKey]?.find(
        (g) => g.my_listing.id === my_listing_id
      );
      if (groupInMock) {
        if (myListingPriceResult?.current_price) {
          groupInMock.my_listing.current_price = myListingPriceResult.current_price;
          if (myListingPriceResult.original_price !== undefined) {
            groupInMock.my_listing.original_price = myListingPriceResult.original_price;
          }
        }
        myListingData = groupInMock.my_listing;
      }
    }

    // 2. Extrai e confere os dados do anúncio concorrente
    let compVerified: {
      title?: string;
      current_price: number;
      original_price?: number | null;
      seller_name?: string;
      seller_reputation?: string;
      shipping_type?: string;
      promo_badge?: string | null;
      thumbnail_url?: string | null;
      sales_count_approx?: number;
      permalink?: string;
      external_id?: string;
    } | null = null;

    // Cenário A: Dados já extraídos diretamente pela extensão via link
    if (verified_data && (verified_data.current_price || verified_data.price)) {
      compVerified = {
        title: verified_data.title || "Anúncio Concorrente",
        current_price: parsePrice(verified_data.current_price || verified_data.price),
        original_price: verified_data.original_price ? parsePrice(verified_data.original_price) : null,
        seller_name: verified_data.seller_name || "Concorrente",
        seller_reputation: verified_data.seller_reputation || "gold",
        shipping_type: verified_data.shipping_type || "padrao",
        promo_badge: verified_data.promo_badge || null,
        thumbnail_url: verified_data.thumbnail_url || verified_data.image || null,
        sales_count_approx: Number(verified_data.sales_count_approx || 0),
        permalink: verified_data.permalink || competitor_permalink,
        external_id: verified_data.external_id || competitor_external_id,
      };
    }

    // Cenário B: Inspeção direta no Mercado Livre via API Oficial + Leitura do link
    if (!compVerified) {
      const mlbId =
        extractMlbId(competitor_external_id) ||
        extractMlbId(competitor_permalink) ||
        (competitor_id ? extractMlbId(competitor_id) : null);

      if (mlbId && platform === "mercadolivre") {
        try {
          // Consulta API Oficial pública de itens do Mercado Livre
          const mlRes = await fetch(`https://api.mercadolibre.com/items/${mlbId}`, {
            headers: { "User-Agent": "CRM-Marketplaces-ERP/2.0", Accept: "application/json" },
            cache: "no-store",
          }).catch(() => null);

          if (mlRes && mlRes.ok) {
            const mlItem = await mlRes.json();
            let resolvedPrice = Number(mlItem.price || 0);
            let resolvedOriginalPrice: number | null = mlItem.original_price ? Number(mlItem.original_price) : null;

            // Busca sale_price oficial com desconto ativo
            try {
              const spRes = await fetch(`https://api.mercadolibre.com/items/${mlbId}/sale_price`, {
                headers: { "User-Agent": "CRM-Marketplaces-ERP/2.0", Accept: "application/json" },
                cache: "no-store",
              });
              if (spRes.ok) {
                const spData = await spRes.json();
                if (spData.amount && Number(spData.amount) > 0) {
                  resolvedPrice = Number(spData.amount);
                  if (spData.regular_amount && Number(spData.regular_amount) > resolvedPrice) {
                    resolvedOriginalPrice = Number(spData.regular_amount);
                  }
                }
              }
            } catch {
              // fallback mantém mlItem.price
            }

            // Logística
            let shippingType = "padrao";
            if (mlItem.shipping?.logistic_type === "fulfillment") {
              shippingType = "ml_full";
            } else if (mlItem.shipping?.logistic_type === "self_service") {
              shippingType = "ml_flex";
            } else if (mlItem.shipping?.logistic_type === "cross_docking" || mlItem.shipping?.logistic_type === "xd_drop_off") {
              shippingType = "ml_coleta";
            }

            // Vendedor e Reputação
            let sellerName = "Concorrente Mercado Livre";
            let sellerReputation = "comum";
            if (mlItem.seller_id) {
              try {
                const sellerRes = await fetch(`https://api.mercadolibre.com/users/${mlItem.seller_id}`, {
                  headers: { "User-Agent": "CRM-Marketplaces-ERP/2.0", Accept: "application/json" },
                  cache: "no-store",
                });
                if (sellerRes.ok) {
                  const sData = await sellerRes.json();
                  if (sData.nickname) sellerName = sData.nickname;
                  const powerStatus = sData.seller_reputation?.power_seller_status;
                  if (powerStatus) {
                    sellerReputation = String(powerStatus).toLowerCase();
                  }
                }
              } catch {
                // mantém default
              }
            }

            // Selo promocional calculado se houver desconto
            let promoBadge: string | null = null;
            if (resolvedOriginalPrice && resolvedOriginalPrice > resolvedPrice) {
              const offPct = Math.round(((resolvedOriginalPrice - resolvedPrice) / resolvedOriginalPrice) * 100);
              if (offPct > 0) promoBadge = `${offPct}% OFF`;
            }

            compVerified = {
              title: mlItem.title,
              current_price: resolvedPrice,
              original_price: resolvedOriginalPrice,
              seller_name: sellerName,
              seller_reputation: sellerReputation,
              shipping_type: shippingType,
              promo_badge: promoBadge,
              thumbnail_url: mlItem.thumbnail ? mlItem.thumbnail.replace("http://", "https://") : null,
              sales_count_approx: mlItem.sold_quantity || 0,
              permalink: mlItem.permalink || competitor_permalink,
              external_id: mlbId,
            };
          }
        } catch (apiErr) {
          console.error("[refresh-comparison] Falha ao consultar API pública do ML:", apiErr);
        }
      }
    }

    // Cenário C: Se ainda não tiver os dados verificados, lê HTML direto do permalink
    if (!compVerified && competitor_permalink) {
      try {
        const pageRes = await fetch(competitor_permalink, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
          },
          cache: "no-store",
        });

        if (pageRes.ok) {
          const html = await pageRes.text();
          // Procura JSON-LD
          const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
          let ldObj: any = null;
          if (ldMatch) {
            try {
              ldObj = JSON.parse(ldMatch[1]);
            } catch {}
          }

          const offer = ldObj?.offers ? (Array.isArray(ldObj.offers) ? ldObj.offers[0] : ldObj.offers) : null;
          const parsedPrice = offer?.price ? parseFloat(offer.price) : 0;

          if (parsedPrice > 0) {
            let shippingType = "padrao";
            if (html.includes("Enviado pelo FULL") || html.includes("ui-pdp-icon--full")) {
              shippingType = "ml_full";
            } else if (html.includes("Chegará hoje") || html.includes("Flex")) {
              shippingType = "ml_flex";
            }

            let promoBadge: string | null = null;
            const discountMatch = html.match(/(\d+%\s*OFF)/i);
            if (discountMatch) {
              promoBadge = discountMatch[1];
            } else if (html.includes("OFERTA DO DIA")) {
              promoBadge = "Oferta do Dia";
            }

            compVerified = {
              title: ldObj?.name || "Anúncio Concorrente",
              current_price: parsedPrice,
              original_price: null,
              seller_name: offer?.seller?.name || "Concorrente",
              seller_reputation: html.includes("gold") ? "gold" : html.includes("platinum") ? "platinum" : "comum",
              shipping_type: shippingType,
              promo_badge: promoBadge,
              thumbnail_url: ldObj?.image ? (Array.isArray(ldObj.image) ? ldObj.image[0] : ldObj.image) : null,
              sales_count_approx: 0,
              permalink: competitor_permalink,
              external_id: competitor_external_id || extractMlbId(competitor_permalink) || "MLB_ITEM",
            };
          }
        }
      } catch (scrapeErr) {
        console.warn("[refresh-comparison] Falha ao ler página do concorrente:", scrapeErr);
      }
    }

    if (!compVerified || !compVerified.current_price) {
      return NextResponse.json(
        {
          error: "Não foi possível verificar os dados do concorrente através do link informado.",
          details: "Certifique-se de que o link do anúncio do concorrente está ativo e acessível.",
        },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    // 3. Atualiza banco Supabase com dados conferidos do concorrente
    let updatedCompetitorRow: any = null;
    const nowIso = new Date().toISOString();

    if (userId) {
      try {
        const compPayload: any = {
          user_id: userId,
          platform: platform || "mercadolivre",
          external_id: compVerified.external_id || competitor_external_id,
          title: compVerified.title,
          current_price: compVerified.current_price,
          original_price: compVerified.original_price || null,
          seller_name: compVerified.seller_name,
          seller_reputation: compVerified.seller_reputation,
          shipping_type: compVerified.shipping_type,
          promo_badge: compVerified.promo_badge,
          permalink: compVerified.permalink || competitor_permalink,
          thumbnail_url: compVerified.thumbnail_url,
          sales_count_approx: compVerified.sales_count_approx,
          last_scraped_at: nowIso,
        };

        const { data: cData, error: cErr } = await supabase
          .from("competitor_listings")
          .upsert(compPayload, { onConflict: "user_id,platform,external_id" })
          .select()
          .single();

        if (!cErr && cData) {
          updatedCompetitorRow = cData;

          // Histórico de preços
          await supabase.from("price_history").insert({
            competitor_listing_id: cData.id,
            price: compVerified.current_price,
            recorded_at: nowIso,
          });
        }
      } catch (dbErr) {
        console.warn("[refresh-comparison] Erro ao gravar concorrente no Supabase:", dbErr);
      }
    }

    // 4. Atualiza Mock Store em memória (para ambientes locais / demonstrações sem banco)
    const platKey = (platform as "mercadolivre" | "shopee") || "mercadolivre";
    const groupInMock = MOCK_COMPARATIVE_DATA[platKey]?.find(
      (g) => g.my_listing.id === my_listing_id
    );
    if (groupInMock) {
      if (myListingPriceResult?.current_price) {
        groupInMock.my_listing.current_price = myListingPriceResult.current_price;
        if (myListingPriceResult.original_price !== undefined) {
          groupInMock.my_listing.original_price = myListingPriceResult.original_price;
        }
      }

      const compInMock = groupInMock.competitors.find(
        (c) => c.id === competitor_id || c.external_id === compVerified?.external_id
      );
      if (compInMock && compVerified) {
        compInMock.current_price = compVerified.current_price;
        if (compVerified.original_price !== undefined) compInMock.original_price = compVerified.original_price;
        if (compVerified.title) compInMock.title = compVerified.title;
        if (compVerified.seller_name) compInMock.seller_name = compVerified.seller_name;
        if (compVerified.seller_reputation) compInMock.seller_reputation = compVerified.seller_reputation;
        if (compVerified.shipping_type) compInMock.shipping_type = compVerified.shipping_type as any;
        if (compVerified.promo_badge !== undefined) compInMock.promo_badge = compVerified.promo_badge;
        if (compVerified.thumbnail_url) compInMock.thumbnail_url = compVerified.thumbnail_url;
        if (compVerified.sales_count_approx !== undefined) compInMock.sales_count_approx = compVerified.sales_count_approx;
        compInMock.last_scraped_at = nowIso;
      }
      recalculateGroupStatus(groupInMock);
    }

    // 5. Calcula discrepância exata e status final
    const myPrice = Number(myListingData?.current_price || 0);
    const compPrice = Number(compVerified.current_price);
    const diffBrl = Number((myPrice - compPrice).toFixed(2));
    const diffPct = compPrice > 0 ? Number(((diffBrl / compPrice) * 100).toFixed(2)) : 0;
    const status = diffBrl < 0 ? "WINNING" : diffBrl === 0 ? "TIED" : "LOSING";

    const responsePayload = {
      success: true,
      message: "Dados conferidos e atualizados com sucesso via Mercado Livre e link do anúncio!",
      verified_at: nowIso,
      my_listing: {
        id: my_listing_id,
        current_price: myPrice,
        original_price: myListingData?.original_price ?? null,
        title: myListingData?.title,
      },
      competitor: {
        id: updatedCompetitorRow?.id || competitor_id,
        ...compVerified,
        price_difference_brl: diffBrl,
        price_difference_pct: diffPct,
      },
      comparison: {
        diff_brl: diffBrl,
        diff_pct: diffPct,
        status,
      },
    };

    return NextResponse.json(responsePayload, { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[refresh-comparison] Erro inesperado:", error);
    return NextResponse.json(
      { error: "Erro interno ao conferir e atualizar dados.", details: error?.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
