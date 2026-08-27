import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withErrorHandling } from "@/server/lib/http";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/lib/errors";

describe("withErrorHandling", () => {
  it("passes through a successful response unchanged", async () => {
    const handler = withErrorHandling(async () => new Response("ok", { status: 200 }));
    const res = await handler(new Request("http://test.local"));
    expect(res.status).toBe(200);
  });

  it.each([
    [new UnauthorizedError(), 401],
    [new ForbiddenError(), 403],
    [new NotFoundError(), 404],
    [new ConflictError(), 409],
  ])("maps %s to status %i", async (error, status) => {
    const handler = withErrorHandling(async () => {
      throw error;
    });
    const res = await handler(new Request("http://test.local"));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBeTruthy();
  });

  it("maps a ZodError to 400 with issues, not a 500", async () => {
    const schema = z.object({ email: z.email() });
    const handler = withErrorHandling(async () => {
      schema.parse({ email: "not-an-email" });
      return new Response("unreachable");
    });
    const res = await handler(new Request("http://test.local"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.issues)).toBe(true);
  });

  it("never leaks an unknown error's message — maps to a generic 500", async () => {
    const handler = withErrorHandling(async () => {
      throw new Error("super secret internal detail: db password is hunter2");
    });
    const res = await handler(new Request("http://test.local"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).not.toContain("hunter2");
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
