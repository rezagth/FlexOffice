import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/server/lib/errors";

const SPACE_1 = "11111111-1111-4111-8111-111111111111";

const requireAuthMock = vi.fn();
const addFavoriteMock = vi.fn();
const removeFavoriteMock = vi.fn();

vi.mock("@/server/auth/rbac", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/server/domains/favorites/favorites", () => ({
  addFavorite: addFavoriteMock,
  removeFavorite: removeFavoriteMock,
}));

const { POST } = await import("@/app/api/favorites/route");
const { DELETE } = await import("@/app/api/favorites/[spaceId]/route");

beforeEach(() => {
  requireAuthMock.mockReset().mockResolvedValue({ userId: "user-a" });
  addFavoriteMock.mockReset().mockResolvedValue(undefined);
  removeFavoriteMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/favorites — ownership comes from the session, never the body", () => {
  it("adds the favorite for the caller's own session, ignoring any userId in the body", async () => {
    const res = await POST(
      new Request("http://test.local/api/favorites", {
        method: "POST",
        body: JSON.stringify({ spaceId: SPACE_1, userId: "someone-else" }),
      })
    );

    expect(res.status).toBe(201);
    expect(addFavoriteMock).toHaveBeenCalledWith("user-a", SPACE_1);
  });

  it("rejects an unauthenticated request before touching the database", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());

    const res = await POST(
      new Request("http://test.local/api/favorites", {
        method: "POST",
        body: JSON.stringify({ spaceId: SPACE_1 }),
      })
    );

    expect(res.status).toBe(401);
    expect(addFavoriteMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/favorites/[spaceId] — ownership comes from the session", () => {
  it("removes the favorite scoped to the caller's own session, not a client-supplied user", async () => {
    const res = await DELETE(new Request(`http://test.local/api/favorites/${SPACE_1}`, { method: "DELETE" }), {
      params: Promise.resolve({ spaceId: SPACE_1 }),
    });

    expect(res.status).toBe(200);
    expect(removeFavoriteMock).toHaveBeenCalledWith("user-a", SPACE_1);
  });
});
