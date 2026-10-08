import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        isAuthenticated: false,
        user: null,
        organization: null,
      });
    }

    const userId = session.user.id;
    const admin = createSupabaseAdminClient();

    // Busca o perfil do usuário
    const { data: profile } = await admin
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      // Retorna dados mínimos do auth se o perfil ainda não estiver sincronizado
      return NextResponse.json({
        isAuthenticated: true,
        user: {
          id: userId,
          email: session.user.email || "",
          full_name: session.user.user_metadata?.full_name || "Usuário Master",
          role: "master_admin",
          is_master: true,
          status: "active",
        },
        organization: {
          id: "default-org",
          code: "EMP-MASTER",
          trade_name: session.user.user_metadata?.trade_name || "Empresa Principal",
          plan_tier: "trial",
          plan_status: "active",
          trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    }

    // Busca dados da organização
    const { data: organization } = await admin
      .from("organizations")
      .select("*")
      .eq("id", profile.organization_id)
      .maybeSingle();

    return NextResponse.json({
      isAuthenticated: true,
      user: profile,
      organization: organization || {
        id: profile.organization_id,
        code: "EMP-MASTER",
        trade_name: "Empresa Cadastrada",
        plan_tier: "trial",
        plan_status: "active",
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { isAuthenticated: false, error: error.message },
      { status: 500 }
    );
  }
}
