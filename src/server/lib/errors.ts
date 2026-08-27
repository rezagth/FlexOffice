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
  constructor(message = "Too many requests") {
    super(message, "RATE_LIMITED", 429);
  }
}
