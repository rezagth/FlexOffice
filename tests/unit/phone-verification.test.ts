import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const {
  profileFindUniqueOrThrow,
  profileUpdate,
  codeFindFirst,
  codeCreate,
  codeUpdate,
  codeUpdateMany,
  sendVerificationCodeMock,
  getSmsProviderMock,
  recordAuditMock,
  createInAppNotificationMock,
} = vi.hoisted(() => ({
  profileFindUniqueOrThrow: vi.fn(),
  profileUpdate: vi.fn(),
  codeFindFirst: vi.fn(),
  codeCreate: vi.fn(),
  codeUpdate: vi.fn(),
  codeUpdateMany: vi.fn(),
  sendVerificationCodeMock: vi.fn(),
  getSmsProviderMock: vi.fn(),
  recordAuditMock: vi.fn(),
  createInAppNotificationMock: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    profile: { findUniqueOrThrow: profileFindUniqueOrThrow, update: profileUpdate },
    phoneVerificationCode: {
      findFirst: codeFindFirst,
      create: codeCreate,
      update: codeUpdate,
      updateMany: codeUpdateMany,
    },
  },
}));
vi.mock("@/server/domains/sms/get-sms-provider", () => ({ getSmsProvider: getSmsProviderMock }));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/domains/notifications/in-app", () => ({ createInAppNotification: createInAppNotificationMock }));

const { requestPhoneVerificationCode, confirmPhoneVerificationCode } = await import(
  "@/server/domains/users/phone-verification"
);
const { ServiceUnavailableError, ValidationError, ConflictError } = await import("@/server/lib/errors");

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  getSmsProviderMock.mockReturnValue({ name: "mock", sendVerificationCode: sendVerificationCodeMock });
  sendVerificationCodeMock.mockResolvedValue(undefined);
  codeCreate.mockResolvedValue({ id: "code-1" });
  profileUpdate.mockResolvedValue({});
  codeUpdateMany.mockResolvedValue({ count: 1 });
});

describe("requestPhoneVerificationCode", () => {
  it("INITIAL_VERIFICATION: sends the code to the candidate number when none is verified yet", async () => {
    profileFindUniqueOrThrow.mockResolvedValue({ phone: null, phoneVerifiedAt: null });

    const result = await requestPhoneVerificationCode("user-1", "0611111111");

    expect(result.purpose).toBe("INITIAL_VERIFICATION");
    expect(sendVerificationCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "0611111111" })
    );
    expect(codeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: "INITIAL_VERIFICATION",
          phone: "0611111111",
          pendingNewPhone: null,
        }),
      })
    );
  });

  it("NUMBER_CHANGE (R51): sends the code to the CURRENT verified number, not the candidate", async () => {
    profileFindUniqueOrThrow.mockResolvedValue({ phone: "0600000000", phoneVerifiedAt: new Date() });

    const result = await requestPhoneVerificationCode("user-1", "0622222222");

    expect(result.purpose).toBe("NUMBER_CHANGE");
    expect(sendVerificationCodeMock).toHaveBeenCalledWith(expect.objectContaining({ phone: "0600000000" }));
    expect(codeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: "NUMBER_CHANGE",
          phone: "0600000000",
          pendingNewPhone: "0622222222",
        }),
      })
    );
  });

  it("rejects asking to 'change' to the already-current number", async () => {
    profileFindUniqueOrThrow.mockResolvedValue({ phone: "0600000000", phoneVerifiedAt: new Date() });
    await expect(requestPhoneVerificationCode("user-1", "0600000000")).rejects.toBeInstanceOf(ValidationError);
    expect(codeCreate).not.toHaveBeenCalled();
  });

  it("surfaces a provider failure as 503 and never creates a code row", async () => {
    getSmsProviderMock.mockImplementation(() => {
      throw new Error("MockSmsProvider must never run in a real production deployment");
    });
    profileFindUniqueOrThrow.mockResolvedValue({ phone: null, phoneVerifiedAt: null });

    await expect(requestPhoneVerificationCode("user-1", "0611111111")).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
    expect(codeCreate).not.toHaveBeenCalled();
  });
});

describe("confirmPhoneVerificationCode", () => {
  it("accepts the correct code, verifies the candidate number (INITIAL_VERIFICATION), and notifies", async () => {
    codeFindFirst.mockResolvedValue({
      id: "code-1",
      purpose: "INITIAL_VERIFICATION",
      phone: "0611111111",
      pendingNewPhone: null,
      codeHash: hash("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
    });

    const result = await confirmPhoneVerificationCode("user-1", "123456");

    expect(result.phone).toBe("0611111111");
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: "0611111111" }) })
    );
    expect(createInAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientProfileId: "user-1", type: "PHONE_VERIFIED" })
    );
  });

  it("applies pendingNewPhone, not the code's own `phone`, for NUMBER_CHANGE", async () => {
    codeFindFirst.mockResolvedValue({
      id: "code-1",
      purpose: "NUMBER_CHANGE",
      phone: "0600000000",
      pendingNewPhone: "0622222222",
      codeHash: hash("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
    });

    const result = await confirmPhoneVerificationCode("user-1", "123456");

    expect(result.phone).toBe("0622222222");
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: "0622222222" }) })
    );
  });

  it("rejects when there is no outstanding code", async () => {
    codeFindFirst.mockResolvedValue(null);
    await expect(confirmPhoneVerificationCode("user-1", "123456")).rejects.toBeInstanceOf(ValidationError);
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("rejects an expired code without consuming it", async () => {
    codeFindFirst.mockResolvedValue({
      id: "code-1",
      purpose: "INITIAL_VERIFICATION",
      phone: "0611111111",
      pendingNewPhone: null,
      codeHash: hash("123456"),
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
      consumedAt: null,
    });
    await expect(confirmPhoneVerificationCode("user-1", "123456")).rejects.toThrow(/expiré/);
    expect(codeUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects once attempts reach 5, without even checking the code", async () => {
    codeFindFirst.mockResolvedValue({
      id: "code-1",
      purpose: "INITIAL_VERIFICATION",
      phone: "0611111111",
      pendingNewPhone: null,
      codeHash: hash("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 5,
      consumedAt: null,
    });
    await expect(confirmPhoneVerificationCode("user-1", "123456")).rejects.toThrow(/tentatives/);
    expect(codeUpdate).not.toHaveBeenCalled();
  });

  it("increments attempts on a wrong code, and does not update the profile", async () => {
    codeFindFirst.mockResolvedValue({
      id: "code-1",
      purpose: "INITIAL_VERIFICATION",
      phone: "0611111111",
      pendingNewPhone: null,
      codeHash: hash("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 1,
      consumedAt: null,
    });
    await expect(confirmPhoneVerificationCode("user-1", "000000")).rejects.toThrow(/incorrect/);
    expect(codeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("rejects a correct code that was already consumed (single-use, race-safe)", async () => {
    codeFindFirst.mockResolvedValue({
      id: "code-1",
      purpose: "INITIAL_VERIFICATION",
      phone: "0611111111",
      pendingNewPhone: null,
      codeHash: hash("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
    });
    codeUpdateMany.mockResolvedValue({ count: 0 }); // lost the race to a concurrent confirm
    await expect(confirmPhoneVerificationCode("user-1", "123456")).rejects.toBeInstanceOf(ValidationError);
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("translates a duplicate-verified-phone constraint violation into a clear conflict", async () => {
    codeFindFirst.mockResolvedValue({
      id: "code-1",
      purpose: "INITIAL_VERIFICATION",
      phone: "0611111111",
      pendingNewPhone: null,
      codeHash: hash("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
    });
    const { Prisma } = await import("@/generated/prisma/client");
    profileUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`phone`) violates "profiles_verified_phone_unique"',
        { code: "P2002", clientVersion: "test" }
      )
    );
    await expect(confirmPhoneVerificationCode("user-1", "123456")).rejects.toBeInstanceOf(ConflictError);
  });
});
