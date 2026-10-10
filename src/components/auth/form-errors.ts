/**
 * Turns an API error body into per-field messages. A 400 from
 * withErrorHandling carries the Zod `issues`; their first path segment is
 * the field name, and their message is the French one from the schema.
 */
export type ApiErrorBody = {
  error?: { code?: string; message?: string; issues?: Array<{ path?: unknown[]; message?: string }> };
} | null;

export function issuesToFieldErrors(body: ApiErrorBody): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of body?.error?.issues ?? []) {
    const key = issue.path?.[0];
    if (typeof key === "string" && issue.message && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** The message to show at the top of a form for a failed request. A raw
 * "Invalid input" (Zod envelope) is replaced by a French sentence. */
export function formErrorMessage(body: ApiErrorBody, fallback: string): string {
  const error = body?.error;
  if (!error?.message || error.code === "INTERNAL_ERROR") return fallback;
  if (error.code === "VALIDATION_ERROR" && error.message === "Invalid input") {
    return "Certains champs sont invalides. Corrigez-les puis réessayez.";
  }
  return error.message;
}

/** Moves focus to the first field in error, so keyboard and screen-reader
 * users land on what needs fixing rather than on the submit button. */
export function focusFirstError(errors: Record<string, string>, order: string[]) {
  const first = order.find((name) => errors[name]);
  if (!first || typeof document === "undefined") return;
  document.getElementById(first)?.focus();
}
