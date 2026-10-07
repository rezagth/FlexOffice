import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, maskEmail, REDACTED, requestIdFrom, serializeError } from "@/server/lib/logger";

/**
 * The logger is the last line of defence against a secret or an address
 * ending up in a log stream with a longer retention and a wider audience
 * than the database. These tests fail if a redaction path disappears.
 */

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { logger: createLogger(stream), lines };
}

describe("logger redaction", () => {
  it("redacts secrets at the top level and one level down", () => {
    const { logger, lines } = capture();
    logger.info({
      event: "test",
      password: "hunter2",
      token: "t0k",
      body: { password: "nested-pw", refreshToken: "r", apiKey: "k", secret: "s" },
      stripe: { client_secret: "pi_secret" },
    });

    const line = lines[0];
    expect(line.password).toBe(REDACTED);
    expect(line.token).toBe(REDACTED);
    expect(line.body).toEqual({ password: REDACTED, refreshToken: REDACTED, apiKey: REDACTED, secret: REDACTED });
    expect(line.stripe).toEqual({ client_secret: REDACTED });
    expect(JSON.stringify(line)).not.toMatch(/hunter2|nested-pw|pi_secret/);
  });

  it("redacts authorization and cookie headers wherever a request is logged", () => {
    const { logger, lines } = capture();
    logger.info({
      event: "test",
      headers: { authorization: "Bearer abc", cookie: "sb-access-token=xyz", "x-api-key": "k", accept: "json" },
      request: { headers: { authorization: "Bearer def", cookie: "a=b" } },
    });

    const line = lines[0] as { headers: Record<string, string>; request: { headers: Record<string, string> } };
    expect(line.headers.authorization).toBe(REDACTED);
    expect(line.headers.cookie).toBe(REDACTED);
    expect(line.headers["x-api-key"]).toBe(REDACTED);
    expect(line.headers.accept).toBe("json");
    expect(line.request.headers).toEqual({ authorization: REDACTED, cookie: REDACTED });
  });

  it("masks e-mail addresses instead of dropping them (the domain stays useful)", () => {
    const { logger, lines } = capture();
    logger.info({ event: "test", email: "jane.doe@acme.fr", user: { email: "bob@example.com" } });

    expect(lines[0].email).toBe("j***@acme.fr");
    expect(lines[0].user).toEqual({ email: "b***@example.com" });
  });

  it("leaves unrelated fields alone", () => {
    const { logger, lines } = capture();
    logger.info({ event: "booking.status_changed", to: "CONFIRMED", booking_id: "b1" });

    expect(lines[0].to).toBe("CONFIRMED");
    expect(lines[0].booking_id).toBe("b1");
  });
});

describe("serializeError", () => {
  it("keeps the stack, the code, the digest and the cause chain", () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505" });
    const error = Object.assign(new Error("insert failed", { cause }), { digest: "123" });

    const serialized = serializeError(error) as Record<string, unknown>;

    expect(serialized.name).toBe("Error");
    expect(serialized.message).toBe("insert failed");
    expect(String(serialized.stack)).toContain("logger-redaction.test.ts");
    expect(serialized.digest).toBe("123");
    expect(serialized.cause).toMatchObject({ message: "duplicate key", code: "23505" });
  });

  it("passes non-errors through", () => {
    expect(serializeError("plain")).toBe("plain");
  });
});

describe("helpers", () => {
  it("maskEmail handles odd input", () => {
    expect(maskEmail("not-an-address")).toBe("***");
    expect(maskEmail(42)).toBe(REDACTED);
  });

  it("reads the request id set by the proxy", () => {
    const request = new Request("http://test.local/", { headers: { "x-request-id": "req-1" } });
    expect(requestIdFrom(request)).toBe("req-1");
    expect(requestIdFrom(new Headers())).toBeUndefined();
  });
});
