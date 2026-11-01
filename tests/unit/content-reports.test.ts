import { beforeEach, describe, expect, it, vi } from "vitest";

const { spaceFindFirst, reportCreate, reportFindUnique, reportUpdateMany, recordAuditMock, unpublishMock } = vi.hoisted(() => ({
  spaceFindFirst: vi.fn(),
  reportCreate: vi.fn(),
  reportFindUnique: vi.fn(),
  reportUpdateMany: vi.fn(),
  recordAuditMock: vi.fn(),
  unpublishMock: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    space: { findFirst: spaceFindFirst },
    contentReport: { create: reportCreate, findUnique: reportFindUnique, updateMany: reportUpdateMany },
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/domains/organizations/moderate-space", () => ({ unpublishSpace: unpublishMock }));

const { createContentReport, actOnReportBySpaceHide, dismissReport } = await import("@/server/domains/reports/reports");
const { createReportSchema } = await import("@/lib/validation/reports");
const { NotFoundError, ConflictError } = await import("@/server/lib/errors");

const INPUT = { reason: "NOT_AUTHORIZED" as const, message: "Le bailleur n'est pas propriétaire." };

beforeEach(() => {
  vi.clearAllMocks();
  spaceFindFirst.mockResolvedValue({ id: "space-1", organizationId: "org-1" });
  reportCreate.mockResolvedValue({ id: "report-1" });
  reportUpdateMany.mockResolvedValue({ count: 1 });
  reportFindUnique.mockResolvedValue({
    id: "report-1",
    status: "PENDING",
    spaceId: "space-1",
    space: { status: "PUBLISHED", organizationId: "org-1" },
  });
});

describe("createContentReport", () => {
  it("records a report on a published space, anonymous or not, and audits it", async () => {
    await createContentReport("salle-a", INPUT, null);
    expect(spaceFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "salle-a", status: "PUBLISHED" } }));
    expect(reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ spaceId: "space-1", reporterProfileId: null, reporterEmail: null }) })
    );
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ event: "space.reported" }));
  });

  it("404s on an unknown or unpublished space", async () => {
    spaceFindFirst.mockResolvedValue(null);
    await expect(createContentReport("x", INPUT, null)).rejects.toBeInstanceOf(NotFoundError);
    expect(reportCreate).not.toHaveBeenCalled();
  });
});

describe("report validation", () => {
  it("requires a reason and a real message", () => {
    expect(createReportSchema.safeParse({ reason: "OTHER", message: "court" }).success).toBe(false);
    expect(createReportSchema.safeParse({ reason: "NOPE", message: "un message assez long" }).success).toBe(false);
    expect(createReportSchema.safeParse({ reason: "OTHER", message: "un message assez long" }).success).toBe(true);
  });
});

describe("admin decisions", () => {
  it("hiding unpublishes the space with the reason and closes every pending report on it", async () => {
    await actOnReportBySpaceHide("admin-1", "report-1", "Annonce illicite");
    expect(unpublishMock).toHaveBeenCalledWith("admin-1", "space-1", "Annonce illicite");
    expect(reportUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: "space-1", status: "PENDING" }, data: expect.objectContaining({ status: "ACTIONED" }) })
    );
  });

  it("does not try to unpublish a space that is no longer published", async () => {
    reportFindUnique.mockResolvedValue({
      id: "report-1",
      status: "PENDING",
      spaceId: "space-1",
      space: { status: "REJECTED", organizationId: "org-1" },
    });
    await actOnReportBySpaceHide("admin-1", "report-1", "Déjà retiré");
    expect(unpublishMock).not.toHaveBeenCalled();
    expect(reportUpdateMany).toHaveBeenCalled();
  });

  it("refuses to decide a report twice", async () => {
    reportFindUnique.mockResolvedValue({ id: "report-1", status: "DISMISSED", spaceId: "space-1", space: { status: "PUBLISHED", organizationId: "org-1" } });
    await expect(dismissReport("admin-1", "report-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("dismissing leaves the space alone", async () => {
    await dismissReport("admin-1", "report-1", "Sans fondement");
    expect(unpublishMock).not.toHaveBeenCalled();
    expect(reportUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DISMISSED", resolution: "Sans fondement" }) })
    );
  });
});
