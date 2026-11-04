import { NextResponse } from "next/server";
import {
  deleteSavedOpportunityListing,
  getSavedOpportunityByIdOrExt,
  updateSavedOpportunityListing,
} from "@/lib/data/savedListingsStore";
import {
  cleanPromoBadge,
  cleanSellerName,
  estimateCompetitorFeesAndShipping,
  extractMlbId,
  extractMlbuId,
  fetchCompetitorViaMlApi,
  refineMlCreationDateFromImage,
  resolveAnyActiveMlToken,
  scrapeCompetitorFromUrl,
} from "@/lib/services/competitorScraper";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    // Se o usuário pediu para re-escanear via Webscraping ("refresh")
    if (body.action === "refresh") {
      const current = await getSavedOpportunityByIdOrExt(id);
      if (!current) {
        return NextResponse.json(
          { success: false, error: "Anúncio não encontrado." },
          { status: 404 }
        );
      }

      const mlbId =
        extractMlbId(current.external_id) || extractMlbId(current.permalink);
      const mlbuId =
        extractMlbuId(current.external_id) || extractMlbuId(current.permalink);
      const token =
        current.platform === "mercadolivre"
          ? await resolveAnyActiveMlToken()
          : null;

      let scraped: any = {};
      if (current.platform === "mercadolivre" && (mlbId || mlbuId)) {
        const apiData = await fetchCompetitorViaMlApi({
          mlbId,
          mlbuId,
          title: current.title,
          sellerName: current.seller_name,
          permalink: current.permalink,
          accessToken: token,
        }).catch(() => null);
        if (apiData) scraped = { ...scraped, ...apiData };
      }

      if (!scraped.current_price) {
        const htmlData = await scrapeCompetitorFromUrl(
          current.permalink,
          current.external_id
        ).catch(() => null);
        if (htmlData) {
          scraped = {
            ...htmlData,
            ...Object.fromEntries(
              Object.entries(scraped).filter(
                ([_, v]) => v !== undefined && v !== null && v !== ""
              )
            ),
          };
        }
      }

      const newPrice = Number(scraped.current_price || current.current_price);
      const newOrig =
        scraped.original_price && Number(scraped.original_price) > newPrice
          ? Number(scraped.original_price)
          : current.original_price && current.original_price > newPrice
          ? current.original_price
          : null;

      const discountPct =
        newOrig && newOrig > newPrice
          ? Math.round(((newOrig - newPrice) / newOrig) * 100)
          : null;

      const promoBadge = cleanPromoBadge(
        scraped.promo_badge ?? current.promo_badge,
        newPrice,
        newOrig
      );

      const feeEst = estimateCompetitorFeesAndShipping(
        newPrice,
        current.platform,
        scraped.listing_type || current.listing_type,
        current.external_id,
        current.is_free_shipping
      );

      const fee = Number(scraped.sale_fee_amount ?? feeEst.sale_fee_amount ?? 0);
      const ship = Number(scraped.shipping_cost ?? feeEst.shipping_cost ?? 0);
      const net = Math.max(0, Number((newPrice - fee - ship).toFixed(2)));

      const createdDate =
        scraped.listing_created_at ||
        current.listing_created_at ||
        (await refineMlCreationDateFromImage(
          current.external_id,
          scraped.thumbnail_url || current.thumbnail_url
        ).catch(() => null));

      const refreshed = await updateSavedOpportunityListing(id, {
        current_price: newPrice,
        original_price: newOrig,
        discount_pct: discountPct,
        promo_badge: promoBadge,
        sales_count_approx:
          scraped.sales_count_approx !== undefined
            ? Number(scraped.sales_count_approx)
            : current.sales_count_approx,
        listing_created_at: createdDate,
        estimated_sale_fee: fee,
        estimated_shipping: ship,
        estimated_net: net,
        seller_name: scraped.seller_name
          ? cleanSellerName(scraped.seller_name)
          : current.seller_name,
        thumbnail_url: scraped.thumbnail_url || current.thumbnail_url,
      });

      return NextResponse.json({
        success: true,
        message: "Dados do anúncio atualizados via Webscraping!",
        data: refreshed,
      });
    }

    const updated = await updateSavedOpportunityListing(id, {
      status:
        body.status === "created" || body.status === "pending"
          ? body.status
          : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
      my_created_sku:
        body.my_created_sku !== undefined ? body.my_created_sku : undefined,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Anúncio não localizado para atualização." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        updated.status === "created"
          ? "✅ Marcado como CRIADO na sua loja!"
          : "⏳ Retornado para fila de Pendentes para Criar.",
      data: updated,
    });
  } catch (error: any) {
    console.error("[PATCH /api/competitors/saved/[id]] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao atualizar anúncio salvo.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await deleteSavedOpportunityListing(id);

    return NextResponse.json({
      success: true,
      message: "Anúncio removido da lista com sucesso.",
    });
  } catch (error: any) {
    console.error("[DELETE /api/competitors/saved/[id]] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao excluir anúncio salvo.",
      },
      { status: 500 }
    );
  }
}

