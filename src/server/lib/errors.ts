/** Structured application errors — mapped to HTTP status in each Route
 * Handler's error boundary, never leaked to the client as a stack trace.
 *
 * The default messages are shown to visitors as-is (the UI displays
 * `error.message` from the API envelope), so they are written in French
 * (UX-11). A caller passing its own message should write it in French too. */

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
  constructor(message = "Vous devez être connecté pour effectuer cette action.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Vous n'êtes pas autorisé à effectuer cette action.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Élément introuvable.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Les informations saisies sont invalides.",
    public readonly issues?: unknown
  ) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Cette action n'est pas possible dans l'état actuel. Rechargez la page et réessayez.") {
    super(message, "CONFLICT", 409);
  }
}

export class RateLimitedError extends AppError {
  constructor(
    message = "Trop de requêtes. Réessayez dans quelques instants.",
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
  constructor(message = "Service momentanément indisponible. Réessayez dans quelques instants.") {
    super(message, "SERVICE_UNAVAILABLE", 503);
  }
}
