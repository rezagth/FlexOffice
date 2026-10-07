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

  it("answers in French: default AppError messages, Zod issues and the generic 500", async () => {
    const notFound = await withErrorHandling(async () => {
      throw new NotFoundError();
    })(new Request("http://test.local"));
    expect((await notFound.json()).error.message).toBe("Élément introuvable.");

    const schema = z.object({ email: z.email(), name: z.string().min(3) });
    const invalid = await withErrorHandling(async () => {
      schema.parse({ email: "not-an-email", name: "a" });
      return new Response("unreachable");
    })(new Request("http://test.local"));
    const invalidBody = await invalid.json();
    expect(invalidBody.error.message).toBe("Les informations saisies sont invalides.");
    const issueMessages = invalidBody.error.issues.map((i: { message: string }) => i.message);
    expect(issueMessages.join(" ")).not.toMatch(/Invalid|Too small/);
    expect(issueMessages[0]).toMatch(/invalide/i);

    const crash = await withErrorHandling(async () => {
      throw new Error("boom");
    })(new Request("http://test.local"));
    expect((await crash.json()).error.message).toMatch(/erreur inattendue/i);
  });
});
