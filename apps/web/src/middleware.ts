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

// E-mail do Super Administrador Geral com liberação irrestrita
const SUPER_ADMIN_EMAIL = "rodolfo.mecatronica@gmail.com";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;

  // Ignora assets estáticos do Next.js, API de autenticação e ícones
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.includes(".")
  ) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  // Inicializa o cliente Supabase SSR para ler os cookies de sessão de forma segura
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

  // Obtém o usuário autenticado atual da sessão segura
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // 1. Bloqueio Geral: Se NÃO estiver logado e tentar rota protegida -> Redireciona para /login
  if (!user && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Se o usuário estiver autenticado:
  if (user) {
    const isSuperAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
    const isApproved = isSuperAdmin || user.user_metadata?.status === "active";

    // Se o usuário logado ainda NÃO foi liberado pelo Administrador Rodolfo:
    if (!isApproved) {
      if (pathname !== "/aguardando-liberacao") {
        return NextResponse.redirect(new URL("/aguardando-liberacao", request.url));
      }
      return response;
    }

    // Se o usuário ESTIVER aprovado (ou for Super Admin) e acessar telas de login/cadastro/aguardando:
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
