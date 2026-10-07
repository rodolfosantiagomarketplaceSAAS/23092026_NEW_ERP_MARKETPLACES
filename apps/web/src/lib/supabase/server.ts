import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Cria cliente Supabase para requisições de página e rotas SSR usando cookies da sessão
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sua-instancia.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sua-anon-key";

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Em Route Handlers ou Server Components, set pode lançar erro ignorável
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Ignorável
        }
      },
    },
    global: {
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
        fetch(url, {
          ...options,
          cache: "no-store",
        }),
    },
  });
}

/**
 * Cria cliente administrativo (Service Role) para validação direta de API Keys da extensão
 * e consultas completas sem interferência de cache do Next.js
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sua-instancia.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sua-key";

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
        fetch(url, {
          ...options,
          cache: "no-store",
        }),
    },
  });
}
