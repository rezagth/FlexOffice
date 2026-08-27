import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client for Route Handlers and Server Components. Reads the
 * session from request cookies. In Server Components `setAll` will throw
 * (cookies are read-only there) — that's expected and safe to swallow,
 * because `src/proxy.ts` is responsible for refreshing the session cookie
 * on every request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — proxy.ts refreshes instead.
          }
        },
      },
    }
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}
