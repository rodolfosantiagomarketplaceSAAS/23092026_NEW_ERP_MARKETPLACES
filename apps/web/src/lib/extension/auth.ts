import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isExtensionToken, verifyExtensionToken } from "./token";

const SUPER_ADMIN_EMAIL = "rodolfo.mecatronica@gmail.com";

export interface RequestUser {
  id: string;
  email: string | null;
  organizationId: string | null;
  role: string;
  source: "extension_token" | "supabase_jwt";
}

/**
 * Resolve e valida o usuário autenticado via `Authorization: Bearer`.
 * Zero-Trust: verifica no banco (`user_profiles`) se o usuário continua com `status = 'active'`,
 * garantindo revogação imediata caso uma conta seja suspensa ou bloqueada.
 */
export async function resolveRequestUser(req: NextRequest): Promise<RequestUser | null> {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const admin = createSupabaseAdminClient();
  let userId: string | null = null;
  let email: string | null = null;
  let source: RequestUser["source"] = "extension_token";

  if (isExtensionToken(token)) {
    const payload = verifyExtensionToken(token);
    if (!payload) return null;
    userId = payload.sub;
    email = payload.email;
    source = "extension_token";
  } else {
    try {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user) return null;
      userId = data.user.id;
      email = data.user.email ?? null;
      source = "supabase_jwt";
    } catch {
      return null;
    }
  }

  const isSuperAdmin = email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const { data: profile } = await admin
    .from("user_profiles")
    .select("organization_id, role, status, email")
    .eq("id", userId)
    .maybeSingle();

  const effectiveEmail = email ?? profile?.email ?? null;
  const effectiveSuperAdmin =
    isSuperAdmin || effectiveEmail?.toLowerCase() === SUPER_ADMIN_EMAIL;

  // Fail-Closed: bloqueia acesso caso o perfil esteja pendente ou suspenso
  if (!effectiveSuperAdmin && profile && profile.status !== "active") {
    return null;
  }

  return {
    id: userId,
    email: effectiveEmail,
    organizationId: profile?.organization_id ?? null,
    role: effectiveSuperAdmin ? profile?.role || "master_admin" : profile?.role || "viewer",
    source,
  };
}
