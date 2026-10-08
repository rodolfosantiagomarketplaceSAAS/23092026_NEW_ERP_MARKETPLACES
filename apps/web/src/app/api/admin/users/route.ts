import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "rodolfo.mecatronica@gmail.com";

/**
 * GET /api/admin/users
 * Lista todos os clientes/usuários cadastrados com dados das suas empresas e status
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Apenas o Rodolfo pode acessar
    if (session?.user?.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "Acesso restrito ao Administrador Geral." }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();

    // Busca todos os perfis com as organizações
    const { data: profiles, error: profErr } = await admin
      .from("user_profiles")
      .select(`
        id,
        full_name,
        email,
        phone,
        role,
        is_master,
        status,
        created_at,
        organization:organizations(
          id,
          code,
          trade_name,
          corporate_name,
          document_type,
          document_number,
          plan_status,
          plan_tier,
          created_at
        )
      `)
      .order("created_at", { ascending: false });

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      users: profiles || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 * Permite ao Rodolfo Liberar (aprovar) ou Bloquear (suspender) uma conta
 */
export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Apenas o Rodolfo pode executar alterações
    if (session?.user?.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "Acesso restrito ao Administrador Geral." }, { status: 403 });
    }

    const body = await req.json();
    const { userId, action } = body; // action: 'approve' | 'suspend'

    if (!userId || !["approve", "suspend"].includes(action)) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const newStatus = action === "approve" ? "active" : "suspended";
    const newPlanStatus = action === "approve" ? "active" : "suspended";

    // 1. Atualiza o perfil do usuário
    const { data: profile, error: profErr } = await admin
      .from("user_profiles")
      .update({ status: newStatus })
      .eq("id", userId)
      .select("id, email, organization_id")
      .single();

    if (profErr || !profile) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    // 2. Atualiza a organização vinculada
    if (profile.organization_id) {
      await admin
        .from("organizations")
        .update({ plan_status: newPlanStatus })
        .eq("id", profile.organization_id);
    }

    // 3. Atualiza os metadados no Supabase Auth para liberação imediata no middleware
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        status: newStatus,
        is_approved: action === "approve",
      },
    });

    // 4. Registra auditoria
    await admin.from("auth_audit_logs").insert({
      organization_id: profile.organization_id,
      user_id: userId,
      event_type: action === "approve" ? "admin_approved_access" : "admin_suspended_access",
      details: {
        performed_by: SUPER_ADMIN_EMAIL,
        action,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message:
        action === "approve"
          ? "Acesso do usuário liberado com sucesso!"
          : "Acesso do usuário bloqueado com sucesso.",
      status: newStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
