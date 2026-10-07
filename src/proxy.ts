import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  cspHeaderName,
  generateNonce,
  NONCE_HEADER,
} from "@/server/config/csp";
import { generateRequestId, REQUEST_ID_HEADER } from "@/server/config/request-id";

/**
 * Header carrying the requested path to Server Components.
 *
 * A Server Component has no way to read the current pathname, and a layout
 * guard needs it: `/app/layout.tsx` runs before any page, so without this it
 * can only ever send an unauthenticated visitor to `/app` — losing the deep
 * link they actually asked for.
 *
 * Always `set`, never `append`: a client sending this header has its value
 * overwritten here. It is plumbing, not a security input — the only thing it
 * feeds is a redirect target, which `safeRedirectPath()` validates anyway.
 */
export const PATHNAME_HEADER = "x-officeflex-pathname";

// Refreshes the Supabase session cookie on every request (renamed from
// `middleware.ts` in Next.js 16 — see AGENTS.md / node_modules/next/dist/docs).
// This does NOT do route authorization: role/organization/capability checks
// stay in each protected layout and page via src/server/auth/rbac.ts and
// page-guards.ts, which are the actual server-side security boundary. This
// proxy only keeps the session cookie from silently expiring between
// requests, forwards the requested path, tags the request with a
// correlation id, and attaches the Content-Security-Policy to pages.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    PATHNAME_HEADER,
    request.nextUrl.pathname + request.nextUrl.search
  );

  // Always generated here, overwriting anything the client sent — see
  // src/server/config/request-id.ts.
  const requestId = generateRequestId();
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  // Pages only: API responses are JSON, never rendered as a document. The
  // policy goes on the request too, because that is where Next.js reads the
  // nonce from to stamp its own scripts.
  let csp: { name: string; value: string } | null = null;
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const nonce = generateNonce();
    csp = { name: cspHeaderName(process.env), value: buildContentSecurityPolicy(nonce, process.env) };
    requestHeaders.set(NONCE_HEADER, nonce);
    requestHeaders.set(csp.name, csp.value);
  }

  const withResponseHeaders = (res: NextResponse) => {
    res.headers.set(REQUEST_ID_HEADER, requestId);
    if (csp) res.headers.set(csp.name, csp.value);
    return res;
  };

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Runs on every request — a demo deploy with no Supabase project
  // configured yet must not take the whole site down because of it.
  // createServerClient() throws synchronously on an empty/missing
  // URL or key, so skip session refresh entirely rather than crash here;
  // getAuthContext() (src/server/auth/rbac.ts) degrades the same way for
  // the same reason, so the rest of the app stays consistent.
  if (!url || !anonKey) {
    return withResponseHeaders(response);
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
        // Rebuilt with the same headers: dropping them here would lose the
        // pathname on exactly the requests that refresh a session, which is
        // most of them for a signed-in user.
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Must be called so an expired token gets refreshed before rendering.
  await supabase.auth.getUser();

  return withResponseHeaders(response);
}

// Not matched: static assets, the health probes (a liveness check must not
// depend on Supabase, which the session refresh calls) and the GlitchTip
// tunnel (machine traffic, no session).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
