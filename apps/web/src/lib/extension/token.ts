import { createHmac, timingSafeEqual } from "crypto";

/**
 * Long-lived, stateless extension token (HMAC-SHA256).
 * Issued automatically when the user opens the ERP logged in, so the Chrome
 * extension stays connected without manual copy/paste of short-lived JWTs.
 */

const TOKEN_PREFIX = "erpx1";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

export interface ExtensionTokenPayload {
  sub: string;
  email: string | null;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.EXTENSION_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("EXTENSION_TOKEN_SECRET (ou SUPABASE_SERVICE_ROLE_KEY) não configurado.");
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
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

  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as ExtensionTokenPayload;
    if (!payload.sub || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
