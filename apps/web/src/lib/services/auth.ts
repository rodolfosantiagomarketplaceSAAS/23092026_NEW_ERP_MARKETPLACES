import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { type MasterRegisterInput } from "@/lib/validators/auth";

export interface OrganizationInfo {
  id: string;
  code: string;
  trade_name: string;
  corporate_name?: string;
  document_type: "cnpj" | "cpf";
  document_number: string;
  state_registration?: string;
  plan_tier: "trial" | "starter" | "pro" | "enterprise";
  plan_status: "active" | "past_due" | "suspended" | "cancelled";
  trial_ends_at: string;
}

export interface UserProfileInfo {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: "master_admin" | "admin" | "operator" | "finance" | "read_only";
  is_master: boolean;
  status: "active" | "pending_confirmation" | "suspended";
}

export interface AuthSessionResponse {
  user: UserProfileInfo | null;
  organization: OrganizationInfo | null;
  isAuthenticated: boolean;
}

/**
 * Registra a Conta Mestra e Organização do ERP (Padrão Tiny ERP & Bling)
 */
export async function registerMasterAccount(payload: MasterRegisterInput): Promise<{
  success: boolean;
  message?: string;
  data?: {
    organization: OrganizationInfo;
    user_profile: UserProfileInfo;
  };
}> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || result.message || "Erro ao realizar cadastro da conta mestra.");
  }

  return result;
}

/**
 * Autentica usuário com e-mail e senha no Supabase Auth
 */
export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      throw new Error("E-mail ou senha incorretos. Verifique suas credenciais.");
    }
    if (error.message.includes("Email not confirmed")) {
      throw new Error("E-mail ainda não confirmado. Verifique sua caixa de entrada.");
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Envia e-mail de recuperação de senha com link seguro (Esqueci a Senha)
 */
export async function requestPasswordReset(email: string) {
  const supabase = getSupabaseBrowserClient();
  const redirectTo = typeof window !== "undefined"
    ? `${window.location.origin}/redefinir-senha`
    : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

/**
 * Redefine a senha do usuário com a nova senha escolhida
 */
export async function updatePassword(newPassword: string) {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Encerra a sessão ativa do ERP de forma segura
 */
export async function signOutUser() {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

/**
 * Recupera perfil e dados da organização logada
 */
export async function getCurrentUserProfileAndOrg(): Promise<AuthSessionResponse> {
  try {
    const res = await fetch("/api/auth/profile", {
      cache: "no-store",
    });

    if (!res.ok) {
      return { user: null, organization: null, isAuthenticated: false };
    }

    const json = await res.json();
    return json;
  } catch {
    return { user: null, organization: null, isAuthenticated: false };
  }
}
