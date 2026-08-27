import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
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
        return NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status }
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
