import pino from "pino";
import { REQUEST_ID_HEADER } from "@/server/config/request-id";

export { REQUEST_ID_HEADER };

/**
 * Structured JSON logger. Always pass `event` plus whatever correlation
 * fields are known (request_id, organization_id) — never a free-text
 * "something went wrong" message, and never a secret (password, token,
 * card data) in any field.
 *
 * Redaction is the safety net, not the policy: it catches the usual field
 * names at the top level and one level down (`*.password` covers
 * `{ body: { password } }`). A secret nested deeper, or under an unusual
 * name, is NOT caught — keep it out of the call in the first place.
 */

export const REDACTED = "[REDACTED]";

const SECRET_KEYS = [
  "password",
  "newPassword",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "apiKey",
  "api_key",
  "secret",
  "clientSecret",
  "client_secret",
  "authorization",
  "cookie",
  "cookies",
  "set-cookie",
];

/** Personal data that stays useful masked: "jane@acme.fr" -> "j***@acme.fr". */
const EMAIL_KEYS = ["email"];

function withWildcard(keys: string[]): string[] {
  return keys.flatMap((key) => {
    // pino paths use the JS accessor syntax; a key with a dash needs brackets.
    const top = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
    const nested = /^[A-Za-z_$][\w$]*$/.test(key) ? `*.${key}` : `*["${key}"]`;
    return [top, nested];
  });
}

export const REDACT_PATHS = [
  ...withWildcard(SECRET_KEYS),
  ...withWildcard(EMAIL_KEYS),
  // Request headers, wherever a request-shaped object gets logged.
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  "*.headers.authorization",
  "*.headers.cookie",
  '*.headers["x-api-key"]',
];

/** "jane.doe@acme.fr" -> "j***@acme.fr"; anything that is not an address -> "***". */
export function maskEmail(value: unknown): string {
  if (typeof value !== "string") return REDACTED;
  const at = value.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${value[0]}***${value.slice(at)}`;
}

export function censor(value: unknown, path: string[]): unknown {
  const key = path[path.length - 1];
  if (EMAIL_KEYS.includes(key)) {
    // Already masked upstream (e.g. LogEmailProvider) — keep as is.
    if (typeof value === "string" && /^.\*\*\*@/.test(value)) return value;
    return maskEmail(value);
  }
  return REDACTED;
}

export function createLogger(destination?: pino.DestinationStream) {
  return pino(
    {
      // `||`, not `??`: an unset env var can arrive as "" rather than
      // undefined depending on the build/runtime environment, and pino
      // rejects an empty level ("default level: must be included in custom
      // levels") — `??` would let that empty string through.
      level: process.env.LOG_LEVEL || "info",
      redact: { paths: REDACT_PATHS, censor },
      base: {
        // Release correlation: which build produced this line.
        version: process.env.APP_VERSION || undefined,
      },
    },
    destination
  );
}

export const logger = createLogger();

export type LogFields = {
  event: string;
  request_id?: string;
  organization_id?: string;
  user_id?: string;
  [key: string]: unknown;
};

/**
 * Correlation id of the current request, set by src/proxy.ts on every
 * request it handles (and echoed in the response). Route handlers read it
 * from the request; `getRequestId()` reads it in Server Components and
 * anything else running inside a request scope.
 */
export function requestIdFrom(source: Request | Headers): string | undefined {
  const headers = source instanceof Headers ? source : source.headers;
  return headers.get(REQUEST_ID_HEADER) ?? undefined;
}

export async function getRequestId(): Promise<string | undefined> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get(REQUEST_ID_HEADER) ?? undefined;
  } catch {
    // Outside a request scope (boot, scripts, tests).
    return undefined;
  }
}

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  code?: unknown;
  digest?: unknown;
  cause?: SerializedError | unknown;
};

/**
 * Keeps what is needed to diagnose (type, message, stack, Postgres/Prisma
 * code, Next.js digest, cause chain) — the previous version dropped the
 * stack, which made every logged error a dead end.
 */
export function serializeError(error: unknown, depth = 0): SerializedError | unknown {
  if (!(error instanceof Error)) return error;
  const extra = error as Error & { code?: unknown; digest?: unknown };
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (extra.code !== undefined) serialized.code = extra.code;
  if (extra.digest !== undefined) serialized.digest = extra.digest;
  if (error.cause !== undefined && depth < 3) serialized.cause = serializeError(error.cause, depth + 1);
  return serialized;
}

export function logEvent(fields: LogFields) {
  logger.info(fields, fields.event);
}

export function logError(fields: LogFields & { error: unknown }) {
  const { error, ...rest } = fields;
  logger.error({ ...rest, error: serializeError(error) }, fields.event);
}
