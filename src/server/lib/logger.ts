import pino from "pino";

/**
 * Structured JSON logger. Always pass `event` plus whatever correlation
 * fields are known (request_id, organization_id) — never a free-text
 * "something went wrong" message, and never a secret (password, token,
 * card data) in any field.
 */
export const logger = pino({
  // `||`, not `??`: an unset env var can arrive as "" rather than
  // undefined depending on the build/runtime environment, and pino
  // rejects an empty level ("default level: must be included in custom
  // levels") — `??` would let that empty string through.
  level: process.env.LOG_LEVEL || "info",
  redact: ["password", "token", "accessToken", "refreshToken", "authorization"],
});

export type LogFields = {
  event: string;
  request_id?: string;
  organization_id?: string;
  user_id?: string;
  [key: string]: unknown;
};

export function logEvent(fields: LogFields) {
  logger.info(fields, fields.event);
}

export function logError(fields: LogFields & { error: unknown }) {
  const { error, ...rest } = fields;
  logger.error(
    {
      ...rest,
      error: error instanceof Error ? { message: error.message, name: error.name } : error,
    },
    fields.event
  );
}
