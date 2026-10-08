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
    const { data: existingOrg, error: orgCheckError } = await supabaseAdmin
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
    // Configura email_confirm: true para liberar acesso instantâneo ao ERP (padrão Bling e Tiny Trial)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        phone: data.phone,
        trade_name: data.trade_name,
        is_master: true,
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

    // 4. Executa a criação da Organização (Tenant) e Perfil Mestre
    // Tenta primeiro via RPC transacional 'register_master_account'
    let orgData: any = null;
    let profileData: any = null;

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("register_master_account", {
      p_user_id: userId,
      p_full_name: data.full_name,
      p_email: data.email,
      p_phone: data.phone,
      p_trade_name: data.trade_name,
      p_corporate_name: data.corporate_name || data.trade_name,
      p_document_type: data.document_type,
      p_document_number: cleanDoc,
      p_state_registration: data.state_registration || "ISENTO",
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });

    if (!rpcError && rpcResult?.success) {
      orgData = rpcResult.organization;
      profileData = rpcResult.user_profile;
    } else {
      // Fallback direto via tabelas caso a RPC ainda esteja pendente de sincronização
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
          plan_status: "active",
        })
        .select()
        .single();

      if (insertOrgErr) {
        // Se as tabelas ainda não existirem no Supabase, loga o aviso com o código SQL
        console.warn("Aviso: tabela 'organizations' ainda não criada no Supabase:", insertOrgErr.message);
        return NextResponse.json({
          success: true,
          message: "Conta criada no Auth! Para ativar os dados multi-tenant, execute a migration no editor SQL do Supabase.",
          user: {
            id: userId,
            email: data.email,
            full_name: data.full_name,
          },
        });
      }

      const { data: insertedProfile } = await supabaseAdmin
        .from("user_profiles")
        .insert({
          id: userId,
          organization_id: insertedOrg.id,
          full_name: data.full_name,
          email: data.email,
          phone: data.phone,
          role: "master_admin",
          is_master: true,
          status: "active",
        })
        .select()
        .single();

      orgData = insertedOrg;
      profileData = insertedProfile;
    }

    return NextResponse.json({
      success: true,
      message: "Conta Mestra criada com sucesso!",
      data: {
        organization: orgData,
        user_profile: profileData,
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
