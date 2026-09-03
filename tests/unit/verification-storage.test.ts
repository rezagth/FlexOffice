import { describe, expect, it } from "vitest";
import {
  buildDocumentStoragePath,
  sanitizeOriginalFilename,
  sniffFileType,
} from "@/server/domains/verification/storage";

/** Real magic-byte prefixes, not fabricated: what an actual PDF/JPEG/PNG
 * begins with. Padded with filler bytes so the length checks in
 * sniffFileType have something to compare. */
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

/**
 * The defence-in-depth this exists for: an uploaded file's actual bytes,
 * never the browser's claimed Content-Type alone — a renamed `.exe` can
 * claim to be `application/pdf` freely, but it cannot fake its own magic
 * number without also becoming a real PDF.
 */
describe("sniffFileType", () => {
  it("recognises a real PDF", () => {
    expect(sniffFileType(PDF_BYTES)).toEqual({ mimeType: "application/pdf", extension: "pdf" });
  });

  it("recognises a real JPEG", () => {
    expect(sniffFileType(JPEG_BYTES)).toEqual({ mimeType: "image/jpeg", extension: "jpg" });
  });

  it("recognises a real PNG", () => {
    expect(sniffFileType(PNG_BYTES)).toEqual({ mimeType: "image/png", extension: "png" });
  });

  it("rejects a file whose bytes match none of the accepted signatures", () => {
    // The first bytes of a ZIP (and therefore also a disguised .docx/.exe
    // repackaged as one) — deliberately not one of the three accepted types.
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(sniffFileType(zipBytes)).toBeNull();
  });

  it("rejects a file claiming to be a PDF by extension alone, with no matching bytes", () => {
    // The attack this defends against: a caller renames malicious.exe to
    // malicious.pdf and sets Content-Type: application/pdf. The bytes never
    // lie the way a filename or a header can.
    const textBytes = new TextEncoder().encode("just some plain text, not a PDF at all");
    expect(sniffFileType(textBytes)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(sniffFileType(new Uint8Array(0))).toBeNull();
  });

  it("rejects a buffer shorter than the shortest signature", () => {
    expect(sniffFileType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("does not false-positive on bytes that only partially match a signature", () => {
    // Starts like a JPEG (0xff 0xd8) but the third byte breaks the match.
    const almostJpeg = new Uint8Array([0xff, 0xd8, 0x00, 0x00]);
    expect(sniffFileType(almostJpeg)).toBeNull();
  });
});

describe("sanitizeOriginalFilename", () => {
  it("keeps an ordinary filename as-is", () => {
    expect(sanitizeOriginalFilename("carte-identite.pdf")).toBe("carte-identite.pdf");
  });

  it("strips path separators rather than preserving directory structure", () => {
    expect(sanitizeOriginalFilename("../../etc/passwd")).not.toMatch(/[/\\]/);
    expect(sanitizeOriginalFilename("C:\\Windows\\evil.pdf")).not.toMatch(/[/\\]/);
  });

  it("strips control characters", () => {
    const withControlChars = "file\u0000name\u001f.pdf";
    const result = sanitizeOriginalFilename(withControlChars);
    expect(result).not.toMatch(/[\x00-\x1f\x7f]/);
  });

  it("truncates a pathologically long filename", () => {
    const long = "a".repeat(500) + ".pdf";
    expect(sanitizeOriginalFilename(long).length).toBeLessThanOrEqual(150);
  });

  it("falls back to a generic name rather than returning an empty string", () => {
    expect(sanitizeOriginalFilename("   ")).toBe("document");
    expect(sanitizeOriginalFilename("/")).not.toBe("");
  });
});

describe("buildDocumentStoragePath", () => {
  it("scopes the path under the organization and verification ids", () => {
    const path = buildDocumentStoragePath("org-1", "verif-1", "doc-1", "pdf");
    expect(path).toBe("org-1/verif-1/doc-1.pdf");
  });

  it("uses the extension derived from sniffed bytes, not a caller-supplied one", () => {
    // The extension parameter comes from sniffFileType()'s own signature
    // set, so a path can only ever end in one of the three accepted
    // extensions — never an arbitrary string smuggled in as a "filename".
    const path = buildDocumentStoragePath("org-1", "verif-1", "doc-1", "png");
    expect(path.endsWith(".png")).toBe(true);
    expect(path).not.toContain("..");
  });
});
