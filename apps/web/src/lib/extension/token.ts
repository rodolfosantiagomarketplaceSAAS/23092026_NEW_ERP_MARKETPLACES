import { createHmac, hkdfSync, timingSafeEqual } from "crypto";

/**
 * Token de autenticação para a Extensão Chrome (HMAC-SHA256 com derivação de chave isolada HKDF).
 * Emitido automaticamente quando o operador aprovado abre o ERP logado (TTL: 30 dias com auto-renovação).
 */

const TOKEN_PREFIX = "erpx1";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias (renovado automaticamente ao abrir o ERP)

export interface ExtensionTokenPayload {
  sub: string;
  email: string | null;
  iat: number;
  exp: number;
}

function getDerivedSigningKey(): Buffer {
  const dedicatedSecret = process.env.EXTENSION_TOKEN_SECRET?.trim();
  if (dedicatedSecret && dedicatedSecret.length >= 16) {
    return Buffer.from(
      hkdfSync("sha256", Buffer.from(dedicatedSecret, "utf8"), Buffer.alloc(0), Buffer.from("crm-erp-extension-token-v1"), 32)
    );
  }

  // Isolamento criptográfico via HKDF caso apenas SUPABASE_SERVICE_ROLE_KEY ou INTEGRATIONS_ENCRYPTION_KEY esteja presente
  const masterMaterial =
    process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!masterMaterial) {
    throw new Error("EXTENSION_TOKEN_SECRET não configurado no servidor.");
  }

  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(masterMaterial, "utf8"),
      Buffer.from("crm-marketplaces-ext-salt-v1", "utf8"),
      Buffer.from("crm-erp-extension-signing-only-v1", "utf8"),
      32
    )
  );
}

function sign(data: string): string {
  return createHmac("sha256", getDerivedSigningKey()).update(data).digest("base64url");
}

/** Assinatura legada (compatibilidade de transição sem desconectar extensões já ativas). */
function signLegacy(data: string): string | null {
  const legacySecret = process.env.EXTENSION_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!legacySecret) return null;
  return createHmac("sha256", legacySecret).update(data).digest("base64url");
}

export function issueExtensionToken(userId: string, email: string | null) {
  const iat = Math.floor(Date.now() / 1000);
  const payload: ExtensionTokenPayload = { sub: userId, email, iat, exp: iat + TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${TOKEN_PREFIX}.${body}`;
  return { token: `${data}.${sign(data)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export function isExtensionToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

export function verifyExtensionToken(token: string): ExtensionTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;

  const signingInput = `${parts[0]}.${parts[1]}`;
  const received = Buffer.from(parts[2]);

  const expectedDerived = Buffer.from(sign(signingInput));
  let validSig =
    expectedDerived.length === received.length && timingSafeEqual(expectedDerived, received);

  if (!validSig) {
    const legacy = signLegacy(signingInput);
    if (legacy) {
      const expectedLegacy = Buffer.from(legacy);
      validSig =
        expectedLegacy.length === received.length && timingSafeEqual(expectedLegacy, received);
    }
  }

  if (!validSig) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    ) as ExtensionTokenPayload;
    if (!payload.sub || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
