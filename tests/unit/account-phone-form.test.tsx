// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const fetchMock = vi.fn();

const { AccountPhoneForm } = await import("@/components/auth/account-phone-form");

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountPhoneForm", () => {
  it("shows the verified number read-only, with a button to change it", () => {
    render(<AccountPhoneForm phone="0612345678" phoneVerifiedAt="2026-01-01T00:00:00.000Z" />);
    expect(screen.getByText("0612345678")).not.toBeNull();
    expect(screen.getByText("— vérifié")).not.toBeNull();
    expect(screen.queryByLabelText("Nouveau numéro")).toBeNull();
  });

  it("goes straight to the number input when there is no phone yet", () => {
    render(<AccountPhoneForm phone={null} phoneVerifiedAt={null} />);
    expect(screen.getByLabelText("Téléphone")).not.toBeNull();
  });

  it("requests a code, then shows the code-entry step on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ purpose: "INITIAL_VERIFICATION", sentToMasked: "*****78" }) });
    render(<AccountPhoneForm phone={null} phoneVerifiedAt={null} />);

    fireEvent.change(screen.getByLabelText("Téléphone"), { target: { value: "0612345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le code" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/account/phone/request-code", expect.objectContaining({ method: "POST" })));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ newPhone: "0612345678" });

    expect(await screen.findByLabelText("Code reçu par SMS")).not.toBeNull();
  });

  it("changing an already-verified number warns that the code goes to the CURRENT number (R51)", () => {
    render(<AccountPhoneForm phone="0600000000" phoneVerifiedAt="2026-01-01T00:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Changer de numéro" }));
    expect(screen.getByText(/0600000000/)).not.toBeNull();
  });

  it("confirms a code and calls router.refresh on success", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ purpose: "INITIAL_VERIFICATION", sentToMasked: "*****78" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ phone: "0612345678" }) });

    render(<AccountPhoneForm phone={null} phoneVerifiedAt={null} />);
    fireEvent.change(screen.getByLabelText("Téléphone"), { target: { value: "0612345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le code" }));
    await screen.findByLabelText("Code reçu par SMS");

    fireEvent.change(screen.getByLabelText("Code reçu par SMS"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ code: "123456" });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
