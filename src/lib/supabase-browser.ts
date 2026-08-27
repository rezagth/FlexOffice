"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Only ever touches the public
 * (`NEXT_PUBLIC_*`) URL and anon key — never a secret.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
