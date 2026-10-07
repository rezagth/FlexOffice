import { describe, expect, it } from "vitest";
import { readUploadedFile } from "@/server/domains/media/multipart";
import { ValidationError } from "@/server/lib/errors";

/** SEC-16 — a non-multipart body is the caller's error: 400, not 500. */
describe("readUploadedFile", () => {
  it("refuses a JSON body with a ValidationError", async () => {
    const request = new Request("http://test.local/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await expect(readUploadedFile(request)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a body that claims multipart but is not", async () => {
    const request = new Request("http://test.local/x", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=zzz" },
      body: "garbage",
    });
    await expect(readUploadedFile(request)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a multipart body without a file", async () => {
    const form = new FormData();
    form.set("file", "not a file");
    const request = new Request("http://test.local/x", { method: "POST", body: form });
    await expect(readUploadedFile(request)).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns the uploaded file", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const request = new Request("http://test.local/x", { method: "POST", body: form });
    const file = await readUploadedFile(request);
    expect(file.size).toBe(3);
  });
});
