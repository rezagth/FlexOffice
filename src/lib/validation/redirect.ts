/**
 * Validates a `redirectTo` value before anything navigates to it.
 *
 * `redirectTo` arrives in the query string, so it is attacker-controlled. Fed
 * straight to `router.push()` or `redirect()` it is an open redirect: a link
 * to `/login?redirectTo=https://evil.example/login` walks the user through a
 * genuine OfficeFlex sign-in and drops them on a copy of it.
 *
 * Only a same-origin path is accepted. Everything else falls back to
 * `fallback` rather than throwing — a malformed link should still sign the
 * user in, just to a safe destination.
 */
export function safeRedirectPath(
  value: unknown,
  fallback = "/post-login"
): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (value.length > 512) return fallback;

  // Must be a root-relative path.
  if (!value.startsWith("/")) return fallback;

  // `//host` and `/\host` are protocol-relative URLs: root-relative in shape,
  // cross-origin in effect.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // A backslash is normalised to a forward slash by some browsers, so it can
  // smuggle `/\/evil.example` past a naive prefix check.
  if (value.includes("\\")) return fallback;

  // Control characters (NUL, newlines, tabs, DEL) can be used to split a
  // response header or break out of an HTML attribute. Written as explicit
  // escapes rather than literal bytes so the intent survives any editor.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  return value;
}
