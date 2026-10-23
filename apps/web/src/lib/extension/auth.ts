import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isExtensionToken, verifyExtensionToken } from "./token";

export interface RequestUser {
  id: string;
  email: string | null;
  source: "extension_token" | "supabase_jwt";
}

/**
 * Resolves the authenticated user from the `Authorization: Bearer` header.
 * Accepts the long-lived extension token (preferred) or a legacy Supabase JWT.
 */
export async function resolveRequestUser(req: NextRequest): Promise<RequestUser | null> {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  if (isExtensionToken(token)) {
    const payload = verifyExtensionToken(token);
    return payload ? { id: payload.sub, email: payload.email, source: "extension_token" } : null;
  }

  try {
    const { data, error } = await createSupabaseAdminClient().auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null, source: "supabase_jwt" };
  } catch {
    return null;
  }
}
