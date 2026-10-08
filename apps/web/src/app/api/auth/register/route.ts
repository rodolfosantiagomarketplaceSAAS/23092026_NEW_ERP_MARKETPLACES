import { NextResponse } from "next/server";
import { masterRegisterSchema, sanitizeDocument } from "@/lib/validators/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Validação estrita dos dados com Zod (Segurança & Integridade)
    const validationResult = masterRegisterSchema.safeParse(body);
    if (!validationResult.success) {
      const errorMsg = validationResult.error.errors[0]?.message || "Dados inválidos.";
      return NextResponse.json(
        { success: false, error: errorMsg, details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const cleanDoc = sanitizeDocument(data.document_number);
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Navegador";

    const supabaseAdmin = createSupabaseAdminClient();

    // 2. Verifica se o documento já está em uso na base de organizações
    const { data: existingOrg } = await supabaseAdmin
      .from("organizations")
      .select("id, code, trade_name")
      .eq("document_number", cleanDoc)
      .maybeSingle();

    if (existingOrg) {
      return NextResponse.json(
        {
          success: false,
          error: `O documento informado já possui uma Conta Mestra cadastrada (${existingOrg.code}). Faça login ou utilize a recuperação de senha.`,
        },
        { status: 409 }
      );
    }

    // 3. Criação segura do Usuário no Supabase Auth
    // Por padrão o status é 'pending_confirmation' (aguardando liberação do ADM Rodolfo)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        phone: data.phone,
        trade_name: data.trade_name,
        is_master: true,
        status: "pending_confirmation",
        is_approved: false,
      },
    });

    if (authError) {
      if (authError.message.toLowerCase().includes("already registered") || authError.message.includes("exists")) {
        return NextResponse.json(
          {
            success: false,
            error: "Já existe uma conta cadastrada com este endereço de e-mail. Utilize a tela de login ou 'Esqueci a Senha'.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: `Falha ao criar credenciais de acesso: ${authError.message}` },
        { status: 400 }
      );
    }

    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Não foi possível obter o identificador do usuário mestre." },
        { status: 500 }
      );
    }

    // 4. Criação da Organização (Tenant) e Perfil com status 'pending_confirmation'
    const accountCode = `EMP-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data: insertedOrg, error: insertOrgErr } = await supabaseAdmin
      .from("organizations")
      .insert({
        code: accountCode,
        trade_name: data.trade_name,
        corporate_name: data.corporate_name || data.trade_name,
        document_type: data.document_type,
        document_number: cleanDoc,
        state_registration: data.state_registration || "ISENTO",
        phone: data.phone,
        plan_tier: "trial",
        plan_status: "past_due", // past_due = aguardando pagamento da mensalidade
      })
      .select()
      .single();

    if (insertOrgErr) {
      console.error("Erro ao criar organização:", insertOrgErr);
      return NextResponse.json(
        { success: false, error: `Erro ao criar empresa: ${insertOrgErr.message}` },
        { status: 500 }
      );
    }

    const { data: insertedProfile, error: insertProfErr } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: userId,
        organization_id: insertedOrg.id,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        role: "master_admin",
        is_master: true,
        status: "pending_confirmation", // Aguardando liberação após pagamento
      })
      .select()
      .single();

    if (insertProfErr) {
      console.error("Erro ao criar perfil:", insertProfErr);
    }

    // Registra log de auditoria
    await supabaseAdmin.from("auth_audit_logs").insert({
      organization_id: insertedOrg.id,
      user_id: userId,
      event_type: "signup_master_pending",
      ip_address: ipAddress,
      user_agent: userAgent,
      details: {
        account_code: accountCode,
        trade_name: data.trade_name,
        status: "pending_confirmation",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Cadastro realizado com sucesso! Sua conta está aguardando liberação do administrador após a confirmação do pagamento da mensalidade.",
      data: {
        organization: insertedOrg,
        user_profile: insertedProfile,
        isPendingApproval: true,
      },
    });
  } catch (error: any) {
    console.error("Erro no cadastro de conta mestra:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno do servidor ao processar o cadastro." },
      { status: 500 }
    );
  }
}
