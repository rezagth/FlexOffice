import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, RateLimitedError } from "./errors";
import { logError } from "./logger";

/**
 * Wraps a Route Handler so thrown `AppError`s (unauthorized, forbidden,
 * not found, validation, conflict, rate-limited) become the matching HTTP
 * status with a safe JSON body, and any other error becomes a generic 500
 * — never a leaked stack trace or internal message.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
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
              message: "Invalid input",
              issues: error.issues,
            },
          },
          { status: 400 }
        );
      }
      logError({ event: "http.unhandled_error", error });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
        { status: 500 }
      );
    }
  };
}
