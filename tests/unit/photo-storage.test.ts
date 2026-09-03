import { describe, expect, it } from "vitest";
import { buildPhotoStoragePath, sniffFileType } from "@/server/domains/media/photo-storage";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const TEXT = new TextEncoder().encode("not an image, just text");
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("sniffFileType", () => {
  it("recognizes a real JPEG signature", () => {
    expect(sniffFileType(JPEG)).toEqual({ mimeType: "image/jpeg", extension: "jpg" });
  });

  it("recognizes a real PNG signature", () => {
    expect(sniffFileType(PNG)).toEqual({ mimeType: "image/png", extension: "png" });
  });

  it("recognizes a real WebP signature (RIFF....WEBP, non-contiguous)", () => {
    expect(sniffFileType(WEBP)).toEqual({ mimeType: "image/webp", extension: "webp" });
  });

  it("rejects a ZIP (a renamed .docx/.exe wrapped in an image extension)", () => {
    expect(sniffFileType(ZIP)).toBeNull();
  });

  it("rejects plain text", () => {
    expect(sniffFileType(TEXT)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(sniffFileType(new Uint8Array())).toBeNull();
  });

  it("rejects a truncated JPEG signature", () => {
    expect(sniffFileType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("rejects a RIFF file that is not WebP (RIFF....WAVE)", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffFileType(wav)).toBeNull();
  });
});

describe("buildPhotoStoragePath", () => {
  it("builds a server-derived path from ids alone, never a filename", () => {
    const path = buildPhotoStoragePath("properties", "prop-1", "photo-1", "jpg");
    expect(path).toBe("properties/prop-1/photo-1.jpg");
  });

  it("keeps property and space photos in separate prefixes of the shared bucket", () => {
    expect(buildPhotoStoragePath("spaces", "space-1", "photo-1", "png")).toBe(
      "spaces/space-1/photo-1.png"
    );
  });
});
