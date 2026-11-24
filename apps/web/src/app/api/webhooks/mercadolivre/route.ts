import { NextRequest, NextResponse } from "next/server";
import {
  mlWebhookPayloadSchema,
  parseMlWebhookTarget,
  verifyMlApplicationId,
  verifyMlWebhookSecret,
} from "@/lib/validators/ml-webhook";
import {
  syncMercadoLivreItemBySeller,
  syncMercadoLivreOrderByShipment,
  syncMercadoLivreSingleOrderBySeller,
} from "@/lib/mercadolivre/webhook-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/webhooks/mercadolivre
 * Healthcheck usado pelo painel DevCenter do Mercado Livre ao validar a Notification Callback URL.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "mercadolivre-webhook", mode: "read-only-get" },
    { status: 200 }
  );
}

/**
 * POST /api/webhooks/mercadolivre
 * Receptor oficial de Webhooks do Mercado Livre (`orders_v2`, `shipments`, `items`).
 * Zero-Trust: nunca grava dados crus do POST — usa apenas o ID notificado para buscar o estado
 * oficial em `api.mercadolibre.com` via HTTP GET autenticado com o token OAuth da loja.
 */
export async function POST(request: NextRequest) {
  const providedToken =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("x-webhook-secret");

  if (
    !verifyMlWebhookSecret({
      configuredSecret: process.env.ML_WEBHOOK_SECRET,
      providedToken,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Webhook token inválido." },
      { status: 401 }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = mlWebhookPayloadSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload de notificação inválido." },
      { status: 400 }
    );
  }

  if (
    !verifyMlApplicationId({
      configuredClientId: process.env.ML_CLIENT_ID,
      payloadApplicationId: parsed.data.application_id,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "application_id divergente." },
      { status: 403 }
    );
  }

  const target = parseMlWebhookTarget(parsed.data);

  if (target.kind === "ignored") {
    return NextResponse.json(
      { ok: true, ignored: true, reason: target.reason, topic: target.topic },
      { status: 200 }
    );
  }

  try {
    if (target.kind === "order") {
      const outcome = await syncMercadoLivreSingleOrderBySeller({
        sellerId: target.sellerId,
        orderId: target.orderId,
      });
      return NextResponse.json({ ok: true, kind: "order", ...outcome }, { status: 200 });
    }

    if (target.kind === "shipment") {
      const outcome = await syncMercadoLivreOrderByShipment({
        sellerId: target.sellerId,
        shipmentId: target.shipmentId,
      });
      return NextResponse.json({ ok: true, kind: "shipment", ...outcome }, { status: 200 });
    }

    const outcome = await syncMercadoLivreItemBySeller({
      sellerId: target.sellerId,
      mlbId: target.mlbId,
    });
    return NextResponse.json({ ok: true, kind: "item", ...outcome }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar webhook ML";
    console.error("[Webhook ML] Erro:", message);
    // Retorna 500 apenas em falha transitória real para o Mercado Livre reenviar a notificação depois
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
