import type { NextRequest } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRequestUser } from "@/lib/extension/auth";

export const SUPER_ADMIN_EMAIL = "rodolfo.mecatronica@gmail.com";

export interface AuthContext {
  userId: string;
  email: string | null;
  organizationId: string | null;
  role: string;
}

export class UnauthorizedError extends Error {
  constructor(message = "Sessão expirada ou acesso não autorizado. Faça login novamente.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolve o usuário autenticado via Supabase Auth (`getUser`, validado no servidor)
 * e verifica em `user_profiles` / `app_metadata` que a conta está APROVADA (`status = 'active'`).
 *
 * Fail-Closed:
 * - Nunca confia em `user_metadata` (editável pelo cliente).
 * - Contas `pending_confirmation` ou `suspended` retornam `null`.
 * - Fallback de `role` quando perfil ausente é `"viewer"` (nunca `"master_admin"`, exceto Super Admin).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const isSuperAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const { data: profile } = await createSupabaseAdminClient()
    .from("user_profiles")
    .select("organization_id, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!isSuperAdmin) {
    if (profile) {
      if (profile.status !== "active") {
        return null;
      }
    } else {
      // Caso o perfil ainda não exista, aceita apenas `app_metadata.status === 'active'` (gravável somente via Service Role)
      const appStatus = (user.app_metadata as Record<string, unknown> | undefined)?.status;
      if (appStatus !== "active") {
        return null;
      }
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: profile?.organization_id ?? null,
    role: isSuperAdmin ? profile?.role ?? "master_admin" : profile?.role ?? "viewer",
  };
}

/**
 * Guard unificado para rotas `/api/*` consumidas tanto pelo Web App (cookies SSR)
 * quanto pela Extensão Chrome (`Authorization: Bearer`).
 */
export async function resolveUnifiedAuth(req?: NextRequest): Promise<AuthContext | null> {
  if (req) {
    const extUser = await resolveRequestUser(req).catch(() => null);
    if (extUser) {
      return {
        userId: extUser.id,
        email: extUser.email,
        organizationId: extUser.organizationId,
        role: extUser.role,
      };
    }
  }
  return getAuthContext();
}

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

const MANAGER_ROLES = new Set(["master_admin", "admin"]);

export function canManageIntegrations(ctx: AuthContext): boolean {
  return MANAGER_ROLES.has(ctx.role) || ctx.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}
