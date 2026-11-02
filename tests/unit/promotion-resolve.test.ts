import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/server/db/prisma", () => ({ prisma: { promotion: { findMany } } }));

const { findActivePromotionForSpace } = await import("@/server/domains/promotions/resolve");

const AT = new Date("2026-11-01T10:00:00Z");

const percent = (over: Record<string, unknown> = {}) => ({
  id: "promo-1",
  discountType: "PERCENTAGE",
  discountPercent: 20,
  discountAmountCents: null,
  usageLimit: null,
  usageCount: 0,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("findActivePromotionForSpace", () => {
  it("ne demande à la base que les promotions PUBLISHED actives à la date, pour cet espace", async () => {
    findMany.mockResolvedValue([]);
    await findActivePromotionForSpace("space-1", AT);
    const args = findMany.mock.calls[0][0];
    expect(args.where.status).toBe("PUBLISHED");
    expect(args.where.startsAt).toEqual({ lte: AT });
    expect(args.where.OR).toEqual([{ endsAt: null }, { endsAt: { gte: AT } }]);
    expect(args.where.spaces).toEqual({ some: { spaceId: "space-1" } });
    expect(args.orderBy).toEqual({ startsAt: "desc" });
  });

  it("renvoie null sans promotion", async () => {
    findMany.mockResolvedValue([]);
    expect(await findActivePromotionForSpace("s", AT)).toBeNull();
  });

  it("convertit un pourcentage", async () => {
    findMany.mockResolvedValue([percent()]);
    expect(await findActivePromotionForSpace("s", AT)).toEqual({
      id: "promo-1",
      discount: { type: "PERCENTAGE", percent: 20 },
    });
  });

  it("convertit un montant fixe en centimes", async () => {
    findMany.mockResolvedValue([
      percent({ discountType: "FIXED_AMOUNT", discountPercent: null, discountAmountCents: 1500 }),
    ]);
    expect(await findActivePromotionForSpace("s", AT)).toEqual({
      id: "promo-1",
      discount: { type: "FIXED_AMOUNT", amountCents: 1500 },
    });
  });

  it("ignore une promotion dont le plafond d'utilisation est atteint", async () => {
    findMany.mockResolvedValue([percent({ usageLimit: 10, usageCount: 10 })]);
    expect(await findActivePromotionForSpace("s", AT)).toBeNull();
  });

  it("ignore une promotion dont le plafond est dépassé", async () => {
    findMany.mockResolvedValue([percent({ usageLimit: 10, usageCount: 11 })]);
    expect(await findActivePromotionForSpace("s", AT)).toBeNull();
  });

  it("accepte une promotion à une utilisation de la limite", async () => {
    findMany.mockResolvedValue([percent({ usageLimit: 10, usageCount: 9 })]);
    expect(await findActivePromotionForSpace("s", AT)).not.toBeNull();
  });

  it("une limite nulle signifie illimité, même avec un grand compteur", async () => {
    findMany.mockResolvedValue([percent({ usageLimit: null, usageCount: 99999 })]);
    expect(await findActivePromotionForSpace("s", AT)).not.toBeNull();
  });

  it("une limite de 0 n'est pas « illimitée » : la promotion est écartée", async () => {
    findMany.mockResolvedValue([percent({ usageLimit: 0, usageCount: 0 })]);
    expect(await findActivePromotionForSpace("s", AT)).toBeNull();
  });

  it("prend la première promotion encore utilisable (la plus récente) en cas de chevauchement", async () => {
    findMany.mockResolvedValue([
      percent({ id: "recent-epuisee", usageLimit: 1, usageCount: 1 }),
      percent({ id: "ancienne-ok", discountPercent: 10 }),
    ]);
    const result = await findActivePromotionForSpace("s", AT);
    expect(result?.id).toBe("ancienne-ok");
  });

  it("propage une erreur de base (jamais de prix remisé par défaut)", async () => {
    findMany.mockRejectedValue(new Error("db down"));
    await expect(findActivePromotionForSpace("s", AT)).rejects.toThrow("db down");
  });
});
