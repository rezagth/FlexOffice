import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, RateLimitedError } from "./errors";
import { logError } from "./logger";
import { assertSameOriginRequest } from "./request-origin";
// Every route handler goes through this module: configuring Zod's French
// messages here covers all server-side parsing.
import "@/lib/validation/zod-locale";

/** Generic messages of the error envelope — shown to the visitor, so in
 * French; the detail of an unexpected error stays in the logs. */
export const GENERIC_VALIDATION_MESSAGE = "Les informations saisies sont invalides.";
export const GENERIC_INTERNAL_ERROR_MESSAGE =
  "Une erreur inattendue est survenue. Réessayez dans quelques instants.";

/**
 * Wraps a Route Handler so thrown `AppError`s (unauthorized, forbidden,
 * not found, validation, conflict, rate-limited) become the matching HTTP
 * status with a safe JSON body, and any other error becomes a generic 500
 * — never a leaked stack trace or internal message.
 *
 * It also refuses cross-site state-changing requests before the handler
 * runs (CSRF — see request-origin.ts), so every route gets the guard
 * without having to remember it.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      assertSameOriginRequest(request);
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof AppError) {
        // Retry-After lets a client back off correctly instead of hammering.
        // Only set for 429: on any other status it would be a guess.
        const headers =
          error instanceof RateLimitedError && error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : undefined;
        return NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status, headers }
        );
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: GENERIC_VALIDATION_MESSAGE,
              issues: error.issues,
            },
          },
          { status: 400 }
        );
      }
      logError({ event: "http.unhandled_error", error });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: GENERIC_INTERNAL_ERROR_MESSAGE } },
        { status: 500 }
      );
    }
  };
}
