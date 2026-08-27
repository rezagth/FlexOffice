import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request (renamed from
// `middleware.ts` in Next.js 16 — see AGENTS.md / node_modules/next/dist/docs).
// This does NOT do route authorization: role/organization checks stay in
// each protected layout via src/server/auth/rbac.ts, which is the actual
// server-side security boundary. This proxy only keeps the session cookie
// from silently expiring between requests.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Runs on every request — a demo deploy with no Supabase project
  // configured yet must not take the whole site down because of it.
  // createServerClient() throws synchronously on an empty/missing
  // URL or key, so skip session refresh entirely rather than crash here;
  // getAuthContext() (src/server/auth/rbac.ts) degrades the same way for
  // the same reason, so the rest of the app stays consistent.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Must be called so an expired token gets refreshed before rendering.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
