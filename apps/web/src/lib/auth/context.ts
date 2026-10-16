import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthContext {
  userId: string;
  email: string | null;
  organizationId: string | null;
  role: string;
}

export class UnauthorizedError extends Error {
  constructor(message = "Sessão expirada. Faça login novamente.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolves the authenticated user (validated against Supabase Auth, not just the cookie)
 * and the organization (tenant) that owns marketplace accounts.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await createSupabaseAdminClient()
    .from("user_profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: profile?.organization_id ?? null,
    role: profile?.role ?? "master_admin",
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

const MANAGER_ROLES = new Set(["master_admin", "admin"]);

export function canManageIntegrations(ctx: AuthContext): boolean {
  return MANAGER_ROLES.has(ctx.role);
}
