import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_EMAIL } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        isAuthenticated: false,
        user: null,
        organization: null,
      });
    }

    const userId = user.id;
    const isSuperAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
    const admin = createSupabaseAdminClient();

    const { data: profile } = await admin
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      const appStatus = (user.app_metadata as Record<string, unknown> | undefined)?.status;
      const effectiveStatus = isSuperAdmin
        ? "active"
        : appStatus === "active"
        ? "active"
        : "pending_confirmation";

      return NextResponse.json({
        isAuthenticated: true,
        user: {
          id: userId,
          email: user.email || "",
          full_name: user.user_metadata?.full_name || "Usuário",
          role: isSuperAdmin ? "master_admin" : "viewer",
          is_master: isSuperAdmin,
          status: effectiveStatus,
        },
        organization: null,
      });
    }

    const { data: organization } = profile.organization_id
      ? await admin
          .from("organizations")
          .select("*")
          .eq("id", profile.organization_id)
          .maybeSingle()
      : { data: null };

    return NextResponse.json({
      isAuthenticated: true,
      user: profile,
      organization: organization ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao consultar perfil.";
    return NextResponse.json(
      { isAuthenticated: false, error: message },
      { status: 500 }
    );
  }
}
