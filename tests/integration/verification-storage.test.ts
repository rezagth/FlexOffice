import { beforeAll, describe, expect, it, vi } from "vitest";
import { hasSupabase } from "./helpers/should-run";
import { createTestUser, deleteTestUser, uniqueSiret } from "./helpers/test-fixtures";

/**
 * The real Storage path: upload, signed-URL read, delete — against an
 * actual private bucket. Everything else about verification documents
 * (which bytes are accepted, path construction, filename sanitizing) is
 * proven without any infrastructure in tests/unit/verification-storage.test.ts;
 * this suite is the one place Supabase Storage itself is exercised, which is
 * why it needs `hasSupabase` rather than `hasDatabase` alone.
 */
let currentSessionUserId: string | null = null;

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        currentSessionUserId
          ? { data: { user: { id: currentSessionUserId } }, error: null }
          : { data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } },
    },
  }),
}));

const REAL_PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xc7, 0xec, 0x8f, 0xa2,
]);

function pdfFile(name = "identity.pdf"): File {
  return new File([REAL_PDF_BYTES], name, { type: "application/pdf" });
}

describe.skipIf(!hasSupabase)("verification document storage (real Supabase Storage)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let becomeLandlord: typeof import("@/server/domains/organizations/become-landlord").becomeLandlord;
  let uploadVerificationDocument: typeof import("@/server/domains/verification/documents").uploadVerificationDocument;
  let deleteVerificationDocument: typeof import("@/server/domains/verification/documents").deleteVerificationDocument;
  let requireVerificationOwnerAccess: typeof import("@/server/domains/verification/access").requireVerificationOwnerAccess;
  let createSignedDocumentUrl: typeof import("@/server/domains/verification/storage").createSignedDocumentUrl;
  let createSupabaseAdminClient: typeof import("@/server/auth/supabase-admin").createSupabaseAdminClient;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    delete process.env.OFFICEFLEX_DEMO_MODE;

    ({ prisma } = await import("@/server/db/prisma"));
    ({ becomeLandlord } = await import("@/server/domains/organizations/become-landlord"));
    ({ uploadVerificationDocument, deleteVerificationDocument } = await import(
      "@/server/domains/verification/documents"
    ));
    ({ requireVerificationOwnerAccess } = await import("@/server/domains/verification/access"));
    ({ createSignedDocumentUrl } = await import("@/server/domains/verification/storage"));
    ({ createSupabaseAdminClient } = await import("@/server/auth/supabase-admin"));
  });

  async function actorFor(userId: string) {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });
    const { resolveActiveContext } = await import("@/server/auth/active-context");
    const { resolveCapabilities } = await import("@/server/auth/capabilities");
    const active = await resolveActiveContext(profile);
    return {
      userId: profile.id,
      email: profile.email,
      name: profile.name,
      platformRole: profile.platformRole,
      isLandlord: profile.isLandlord,
      activeMode: active.activeMode,
      activeOrgId: active.activeOrgId,
      activeOrgRole: active.activeOrgRole,
      capabilities: resolveCapabilities({
        platformRole: profile.platformRole,
        activeMode: active.activeMode,
        isLandlord: profile.isLandlord,
        activeOrgRole: active.activeOrgRole,
      }),
      landlordContextUnavailable: active.landlordContextUnavailable,
      role: profile.role,
      organizationId: active.activeOrgId,
    };
  }

  async function openActivity(userId: string) {
    const organization = await becomeLandlord({
      actor: await actorFor(userId),
      input: {
        holderType: "COMPANY",
        activityType: "OWNER",
        legalName: "Storage Test SARL",
        siret: uniqueSiret(),
        legalRepresentativeName: "Test Rep",
        address: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      },
    });
    const verification = await prisma.landlordVerification.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    return verification;
  }

  it("uploads a real PDF, stores it privately, and returns metadata with no storage path", async () => {
    const user = await createTestUser();
    const verification = await openActivity(user.id);

    const document = await uploadVerificationDocument({
      verification,
      uploadedByProfileId: user.id,
      organizationId: verification.organizationId,
      declaredType: "K_BIS",
      file: pdfFile(),
    });

    expect(document.type).toBe("K_BIS");
    expect(document.mimeType).toBe("application/pdf");
    expect(document).not.toHaveProperty("storagePath");

    const stored = await prisma.verificationDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(stored.checksum).toMatch(/^[0-9a-f]{64}$/);
    // The path never contains the original filename.
    expect(stored.storagePath).not.toContain("identity");
    expect(stored.storagePath).toBe(
      `${verification.organizationId}/${verification.id}/${document.id}.pdf`
    );

    await deleteTestUser(user.id);
  });

  it("rejects a file whose declared MIME type does not match its actual bytes", async () => {
    const user = await createTestUser();
    const verification = await openActivity(user.id);

    // Real PDF bytes, but claiming to be a PNG — the mismatch this system is
    // built to catch, since a browser's Content-Type is only ever a claim.
    const spoofed = new File([REAL_PDF_BYTES], "fake.png", { type: "image/png" });

    await expect(
      uploadVerificationDocument({
        verification,
        uploadedByProfileId: user.id,
        organizationId: verification.organizationId,
        declaredType: "K_BIS",
        file: spoofed,
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(await prisma.verificationDocument.count({ where: { verificationId: verification.id } })).toBe(
      0
    );

    await deleteTestUser(user.id);
  });

  it("Cas 8: the storage path alone does not grant access — only a signed URL does", async () => {
    const user = await createTestUser();
    const verification = await openActivity(user.id);

    const document = await uploadVerificationDocument({
      verification,
      uploadedByProfileId: user.id,
      organizationId: verification.organizationId,
      declaredType: "K_BIS",
      file: pdfFile(),
    });
    const stored = await prisma.verificationDocument.findUniqueOrThrow({
      where: { id: document.id },
    });

    // An anonymous, unsigned request for the exact object path — what an
    // attacker who somehow learned the path (a log line, a referrer header)
    // would try. The bucket is private, so this must fail.
    const supabase = createSupabaseAdminClient();
    const { data: publicAttempt } = supabase.storage
      .from("verification-documents")
      .getPublicUrl(stored.storagePath);
    const response = await fetch(publicAttempt.publicUrl);
    expect(response.ok).toBe(false);

    // The sanctioned path: a signed URL, generated only after
    // requireVerificationOwnerAccess() has authorized the caller.
    currentSessionUserId = user.id;
    await requireVerificationOwnerAccess(verification.id);
    currentSessionUserId = null;

    const signedUrl = await createSignedDocumentUrl(stored.storagePath);
    const signedResponse = await fetch(signedUrl);
    expect(signedResponse.ok).toBe(true);

    await deleteTestUser(user.id);
  });

  it("deletes both the database row and the stored object", async () => {
    const user = await createTestUser();
    const verification = await openActivity(user.id);

    const document = await uploadVerificationDocument({
      verification,
      uploadedByProfileId: user.id,
      organizationId: verification.organizationId,
      declaredType: "K_BIS",
      file: pdfFile(),
    });
    const stored = await prisma.verificationDocument.findUniqueOrThrow({
      where: { id: document.id },
    });

    await deleteVerificationDocument({
      verification,
      documentId: document.id,
      actorProfileId: user.id,
      organizationId: verification.organizationId,
    });

    expect(await prisma.verificationDocument.findUnique({ where: { id: document.id } })).toBeNull();

    const supabase = createSupabaseAdminClient();
    const { data: listing } = await supabase.storage
      .from("verification-documents")
      .list(`${verification.organizationId}/${verification.id}`);
    expect(listing?.some((f) => stored.storagePath.endsWith(f.name))).toBe(false);

    await deleteTestUser(user.id);
  });

  it("enforces the per-dossier document cap", async () => {
    const user = await createTestUser();
    const verification = await openActivity(user.id);

    const { MAX_DOCUMENTS_PER_VERIFICATION } = await import(
      "@/server/domains/verification/storage"
    );
    for (let i = 0; i < MAX_DOCUMENTS_PER_VERIFICATION; i++) {
      await uploadVerificationDocument({
        verification,
        uploadedByProfileId: user.id,
        organizationId: verification.organizationId,
        declaredType: "OTHER",
        file: pdfFile(`doc-${i}.pdf`),
      });
    }

    await expect(
      uploadVerificationDocument({
        verification,
        uploadedByProfileId: user.id,
        organizationId: verification.organizationId,
        declaredType: "OTHER",
        file: pdfFile("one-too-many.pdf"),
      })
    ).rejects.toMatchObject({ status: 400 });

    await deleteTestUser(user.id);
  });
});
