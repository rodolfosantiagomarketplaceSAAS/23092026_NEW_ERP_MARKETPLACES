import assert from "node:assert/strict";
import test from "node:test";
import {
  mlWebhookPayloadSchema,
  parseMlWebhookTarget,
  verifyMlApplicationId,
  verifyMlWebhookSecret,
} from "../../validators/ml-webhook";

test("parseMlWebhookTarget reconhece notificações de vendas orders_v2, envios shipments e estoque items", () => {
  // Arrange
  const rawOrderNotification = {
    _id: "notif-001",
    resource: "/orders/2000009876543210",
    user_id: 192837465,
    topic: "orders_v2",
    application_id: 8877665544,
    attempts: 1,
  };

  const rawShipmentNotification = {
    resource: "/shipments/4399887766",
    user_id: "192837465",
    topic: "shipments",
  };

  const rawItemNotification = {
    resource: "/items/mlb391827364",
    user_id: 192837465,
    topic: "items",
  };

  // Act
  const parsedOrder = parseMlWebhookTarget(mlWebhookPayloadSchema.parse(rawOrderNotification));
  const parsedShip = parseMlWebhookTarget(mlWebhookPayloadSchema.parse(rawShipmentNotification));
  const parsedItem = parseMlWebhookTarget(mlWebhookPayloadSchema.parse(rawItemNotification));

  // Assert
  assert.deepEqual(parsedOrder, {
    kind: "order",
    orderId: 2000009876543210,
    sellerId: "192837465",
  });
  assert.deepEqual(parsedShip, {
    kind: "shipment",
    shipmentId: 4399887766,
    sellerId: "192837465",
  });
  assert.deepEqual(parsedItem, {
    kind: "item",
    mlbId: "MLB391827364",
    sellerId: "192837465",
  });
});

test("parseMlWebhookTarget ignora tópicos não relacionados ou resources malformados com segurança", () => {
  // Arrange
  const unsupportedTopic = mlWebhookPayloadSchema.parse({
    resource: "/questions/12345",
    user_id: 192837465,
    topic: "questions",
  });

  const ssrfAttempt = mlWebhookPayloadSchema.parse({
    resource: "https://evil.example.com/orders/999",
    user_id: 192837465,
    topic: "orders_v2",
  });

  // Act
  const resUnsupported = parseMlWebhookTarget(unsupportedTopic);
  const resSsrf = parseMlWebhookTarget(ssrfAttempt);

  // Assert
  assert.equal(resUnsupported.kind, "ignored");
  assert.equal(resSsrf.kind, "ignored");
});

test("verifyMlWebhookSecret e verifyMlApplicationId validam autenticidade da origem", () => {
  // Arrange & Act & Assert
  assert.equal(
    verifyMlWebhookSecret({ configuredSecret: "", providedToken: null }),
    true
  );
  assert.equal(
    verifyMlWebhookSecret({ configuredSecret: "segredo-123", providedToken: "segredo-123" }),
    true
  );
  assert.equal(
    verifyMlWebhookSecret({ configuredSecret: "segredo-123", providedToken: "errado" }),
    false
  );

  assert.equal(
    verifyMlApplicationId({ configuredClientId: "998877", payloadApplicationId: 998877 }),
    true
  );
  assert.equal(
    verifyMlApplicationId({ configuredClientId: "998877", payloadApplicationId: 112233 }),
    false
  );
});
