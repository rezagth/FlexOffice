import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logError = vi.fn();
vi.mock("@/server/lib/logger", () => ({ logError, logEvent: vi.fn() }));

const { geocodeAddress } = await import("@/server/domains/properties/geocode");

const address = { addressLine1: "10 rue de Rivoli", city: "Paris", postalCode: "75001" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => ({ ok: true, json: async () => body });

describe("geocodeAddress", () => {
  it("renvoie les coordonnées numériques du premier résultat", async () => {
    fetchMock.mockResolvedValue(ok([{ lat: "48.8566", lon: "2.3522" }, { lat: "0", lon: "0" }]));
    expect(await geocodeAddress(address)).toEqual({ latitude: 48.8566, longitude: 2.3522 });
  });

  it("construit la requête avec adresse, code postal, ville et France par défaut", async () => {
    fetchMock.mockResolvedValue(ok([]));
    await geocodeAddress(address);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("q")).toBe("10 rue de Rivoli, 75001, Paris, France");
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("respecte la politique de Nominatim : User-Agent descriptif et délai maximal", async () => {
    fetchMock.mockResolvedValue(ok([]));
    await geocodeAddress(address);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/MakomSpace/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("utilise le pays fourni", async () => {
    fetchMock.mockResolvedValue(ok([]));
    await geocodeAddress({ ...address, country: "Belgique" });
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.get("q")).toContain("Belgique");
  });

  it("aucun résultat → null", async () => {
    fetchMock.mockResolvedValue(ok([]));
    expect(await geocodeAddress(address)).toBeNull();
  });

  it("réponse HTTP non OK → null, sans exception", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => [] });
    expect(await geocodeAddress(address)).toBeNull();
  });

  it.each([
    [{ lat: "abc", lon: "2" }],
    [{ lat: "48", lon: "" }],
    [{ lat: "NaN", lon: "Infinity" }],
  ])("coordonnées illisibles %j → null", async (row) => {
    fetchMock.mockResolvedValue(ok([row]));
    expect(await geocodeAddress(address)).toBeNull();
  });

  it("panne réseau ou délai dépassé → null + journal, jamais d'exception", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await geocodeAddress(address)).toBeNull();
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ event: "property.geocoding_failed" }));
  });

  it("JSON invalide → null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    expect(await geocodeAddress(address)).toBeNull();
  });

  it("une latitude ou longitude égale à 0 est une coordonnée valide, pas une erreur", async () => {
    fetchMock.mockResolvedValue(ok([{ lat: "0", lon: "0" }]));
    expect(await geocodeAddress(address)).toEqual({ latitude: 0, longitude: 0 });
  });
});
