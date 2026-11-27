import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Rotas públicas que não exigem autenticação prévia
const PUBLIC_ROUTES = [
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/aguardando-liberacao",
];

const SUPER_ADMIN_EMAIL = "rodolfo.mecatronica@gmail.com";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;

  // Preflight CORS restrito apenas às rotas de API consumidas pela extensão
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const isAllowedOrigin =
      origin.startsWith("chrome-extension://") ||
      origin.includes("mercadolivre.com.br") ||
      origin.includes("shopee.com.br") ||
      (appUrl && origin === appUrl);

    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": isAllowedOrigin ? origin : appUrl || "null",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept",
        Vary: "Origin",
      },
    });
  }

  // Ignora assets estáticos e rotas de API (cada rota /api/* valida sua própria autenticação via getAuthContext / resolveUnifiedAuth)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  // Validação server-side real do token JWT junto ao Supabase Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    const isSuperAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

    // SEGURANÇA CRÍTICA: Nunca confia em `user_metadata` (gravável pelo cliente via ANON_KEY).
    // Confia apenas em `app_metadata.status` (gravável exclusivamente por Service Role)
    // ou consulta direta a `public.user_profiles` protegida por RLS.
    const appStatus = (user.app_metadata as Record<string, unknown> | undefined)?.status;
    let isApproved = isSuperAdmin || appStatus === "active";

    if (!isApproved && appStatus !== "pending_confirmation" && appStatus !== "suspended") {
      // Compatibilidade imediata para contas já aprovadas antes da migração de `app_metadata`
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("status")
        .eq("id", user.id)
        .maybeSingle();
      isApproved = profile?.status === "active";
    }

    if (!isApproved) {
      if (pathname !== "/aguardando-liberacao") {
        return NextResponse.redirect(new URL("/aguardando-liberacao", request.url));
      }
      return response;
    }

    if (
      pathname === "/login" ||
      pathname === "/cadastro" ||
      pathname === "/aguardando-liberacao"
    ) {
      return NextResponse.redirect(new URL("/inteligencia", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
