/**
 * The visitor-facing message of a failed API call: the `{ error: { message } }`
 * envelope written by withErrorHandling when there is one, `fallback`
 * otherwise (network proxy page, empty body…). Never throws.
 */
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
    return typeof message === "string" && message.trim() ? message : fallback;
  } catch {
    return fallback;
  }
}

export const NETWORK_ERROR_MESSAGE =
  "Connexion impossible. Vérifiez votre réseau et réessayez.";
