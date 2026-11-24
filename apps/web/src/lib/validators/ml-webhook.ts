import { z } from "zod";
import { safeEqual } from "../security/crypto";

export const mlWebhookPayloadSchema = z.object({
  _id: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  resource: z.string().trim().min(2).max(250),
  user_id: z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]),
  topic: z.string().trim().min(2).max(80),
  application_id: z.union([z.number(), z.string()]).optional(),
  attempts: z.number().int().optional(),
  sent: z.string().optional(),
  received: z.string().optional(),
});

export type MlWebhookPayload = z.infer<typeof mlWebhookPayloadSchema>;

export type ParsedMlWebhookTarget =
  | { kind: "order"; orderId: number; sellerId: string }
  | { kind: "shipment"; shipmentId: number; sellerId: string }
  | { kind: "item"; mlbId: string; sellerId: string }
  | { kind: "ignored"; reason: string; topic: string };

/**
 * Valida token secreto opcional (`ML_WEBHOOK_SECRET`) enviado na query `?token=...`
 * ou no header `x-webhook-secret`. Quando não configurado no ambiente, permite o fluxo
 * (a autenticidade do dado continua garantida porque buscamos tudo via GET OAuth no ML).
 */
export function verifyMlWebhookSecret(params: {
  configuredSecret?: string | null;
  providedToken?: string | null;
}): boolean {
  const expected = (params.configuredSecret ?? "").trim();
  if (!expected) return true;

  const provided = (params.providedToken ?? "").trim();
  if (!provided) return false;

  return safeEqual(provided, expected);
}

/**
 * Confere se o `application_id` notificado pelo Mercado Livre pertence ao `ML_CLIENT_ID` do ERP.
 */
export function verifyMlApplicationId(params: {
  configuredClientId?: string | null;
  payloadApplicationId?: string | number | null;
}): boolean {
  const expected = (params.configuredClientId ?? "").trim();
  if (!expected || expected === "seu_client_id_aqui") return true;
  if (params.payloadApplicationId == null) return true;

  return String(params.payloadApplicationId).trim() === expected;
}

/**
 * Extrai com segurança o identificador da entidade notificada pelo Mercado Livre.
 * Nunca confia em URLs completas: aceita apenas caminhos canônicos (`/orders/123`, `/shipments/456`, `/items/MLB...`).
 */
export function parseMlWebhookTarget(payload: MlWebhookPayload): ParsedMlWebhookTarget {
  const sellerId = String(payload.user_id).trim();
  const topic = payload.topic.trim().toLowerCase();
  const resource = payload.resource.trim();

  if (topic === "orders_v2" || topic === "orders") {
    const match = resource.match(/^\/?orders\/(\d+)(?:\/.*)?$/i);
    if (!match) {
      return { kind: "ignored", reason: "invalid_order_resource", topic };
    }
    const orderId = Number(match[1]);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return { kind: "ignored", reason: "invalid_order_id", topic };
    }
    return { kind: "order", orderId, sellerId };
  }

  if (topic === "shipments") {
    const match = resource.match(/^\/?shipments\/(\d+)(?:\/.*)?$/i);
    if (!match) {
      return { kind: "ignored", reason: "invalid_shipment_resource", topic };
    }
    const shipmentId = Number(match[1]);
    if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) {
      return { kind: "ignored", reason: "invalid_shipment_id", topic };
    }
    return { kind: "shipment", shipmentId, sellerId };
  }

  if (topic === "items") {
    const match = resource.match(/^\/?items\/(ML[A-Z]\d+)(?:\/.*)?$/i);
    if (!match) {
      return { kind: "ignored", reason: "invalid_item_resource", topic };
    }
    return { kind: "item", mlbId: match[1].toUpperCase(), sellerId };
  }

  return { kind: "ignored", reason: "unsupported_topic", topic };
}
