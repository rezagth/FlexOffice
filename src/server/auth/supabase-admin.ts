import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses Auth and any future Row Level
 * Security policies — for trusted server-only code (seed script, admin
 * user creation) ONLY.
 *
 * NEVER import this from a Route Handler that serves end-user requests,
 * and NEVER let `SUPABASE_SERVICE_ROLE_KEY` reach a `NEXT_PUBLIC_*`
 * variable or a Client Component.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
