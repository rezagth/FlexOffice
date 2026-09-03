/** Structured application errors — mapped to HTTP status in each Route
 * Handler's error boundary, never leaked to the client as a stack trace. */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not allowed to perform this action") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Invalid input",
    public readonly issues?: unknown
  ) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflicting state") {
    super(message, "CONFLICT", 409);
  }
}

export class RateLimitedError extends AppError {
  constructor(
    message = "Too many requests",
    public readonly retryAfterSeconds?: number
  ) {
    super(message, "RATE_LIMITED", 429);
  }
}

/**
 * The authentication or database backend could not be reached, or answered
 * with a server-side failure.
 *
 * Exists so a genuine outage is never reported as "signed out". Before this,
 * `getAuthContext()` caught everything and returned `null`, which meant a
 * database being down looked exactly like a visitor with no session: protected
 * pages bounced everyone to /login and nothing said why.
 *
 * 503 rather than 500: the request was well-formed and the caller may retry.
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(message, "SERVICE_UNAVAILABLE", 503);
  }
}
