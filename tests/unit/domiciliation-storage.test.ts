import { describe, expect, it } from "vitest";
import {
  buildAttestationStoragePath,
  sanitizeOriginalFilename,
  sniffFileType,
} from "@/server/domains/organizations/domiciliation-storage";

describe("sniffFileType", () => {
  it("recognizes a PDF by its magic bytes, ignoring any claimed type", () => {
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(sniffFileType(pdfHeader)).toEqual({ mimeType: "application/pdf", extension: "pdf" });
  });

  it("returns null for bytes matching no known signature", () => {
    expect(sniffFileType(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
  });
});

describe("buildAttestationStoragePath", () => {
  it("is deterministic per (org, request) pair, so a re-upload replaces it in place", () => {
    const path = buildAttestationStoragePath("org-1", "req-1", "pdf");
    expect(path).toBe("org-1/req-1/attestation.pdf");
    expect(buildAttestationStoragePath("org-1", "req-1", "pdf")).toBe(path);
  });
});

describe("sanitizeOriginalFilename", () => {
  it("strips path separators and control characters, for display only", () => {
    expect(sanitizeOriginalFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeOriginalFilename("")).toBe("document");
  });
});
