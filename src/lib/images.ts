/**
 * Whether next/image may run `src` through its optimizer (UX-18).
 *
 * The optimizer only accepts local files and the hosts listed in
 * next.config.ts `images.remotePatterns` (our Supabase Storage public
 * buckets); anything else makes next/image throw during render. Space photos
 * can still come from the deprecated `Space.photos` column, which accepted
 * arbitrary URLs — those are rendered `unoptimized` (a plain <img>, never
 * fetched by our server) rather than taking the page down.
 *
 * Loopback/private Supabase hosts (local `supabase start`) are also left
 * unoptimized: Next.js refuses to fetch private IPs by default.
 */
const STORAGE_PUBLIC_PATH = "/storage/v1/object/public/";

function isPrivateHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

export function canOptimizeImage(
  src: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  const base = supabaseUrl?.trim();
  if (!base) return false;
  try {
    const storage = new URL(base);
    const image = new URL(src);
    return (
      image.origin === storage.origin &&
      image.pathname.startsWith(STORAGE_PUBLIC_PATH) &&
      !isPrivateHost(image.hostname)
    );
  } catch {
    return false;
  }
}
