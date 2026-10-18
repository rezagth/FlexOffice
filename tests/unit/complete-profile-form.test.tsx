// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));

// Radix Checkbox (isRealEstateProfessional) measures itself; jsdom has no
// ResizeObserver — same stub as tests/unit/auth-forms.test.tsx.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const fetchMock = vi.fn();

const { CompleteProfileForm } = await import("@/components/auth/complete-profile-form");

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function chooseRadio(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

describe("CompleteProfileForm", () => {
  it("pre-fills phone and the already-answered need/holderType", () => {
    render(
      <CompleteProfileForm
        initialNeed="SEARCH"
        initialHolderType="INDIVIDUAL"
        initialPhone="0600000000"
        hasOrganization={false}
        backHref=""
      />
    );
    expect(screen.getByRole("radio", { name: "Je cherche un espace" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Un particulier" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Téléphone") as HTMLInputElement).value).toBe("0600000000");
  });

  it("shows company fields only for COMPANY and only when there is no organization yet", () => {
    const { rerender } = render(
      <CompleteProfileForm initialNeed="" initialHolderType="" initialPhone="" hasOrganization={false} backHref="" />
    );
    expect(screen.queryByLabelText("Raison sociale")).toBeNull();
    chooseRadio("Une société");
    expect(screen.getByLabelText("Raison sociale")).not.toBeNull();

    rerender(
      <CompleteProfileForm
        initialNeed=""
        initialHolderType="COMPANY"
        initialPhone=""
        hasOrganization={true}
        backHref=""
      />
    );
    expect(screen.queryByLabelText("Raison sociale")).toBeNull();
  });

  it("requires activityType only for PUBLISH, and only when there is no organization yet", () => {
    render(
      <CompleteProfileForm initialNeed="" initialHolderType="" initialPhone="" hasOrganization={false} backHref="" />
    );
    chooseRadio("Je publie un espace");
    expect(screen.getByRole("radio", { name: "Propriétaire" })).not.toBeNull();
  });

  it("does not ask activityType again for an account that already has an organization", () => {
    render(
      <CompleteProfileForm
        initialNeed="PUBLISH"
        initialHolderType="INDIVIDUAL"
        initialPhone="0600000000"
        hasOrganization={true}
        backHref=""
      />
    );
    expect(screen.queryByRole("radio", { name: "Propriétaire" })).toBeNull();
  });

  it("submits the expected payload and redirects to backHref on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ organizationCreated: false }) });

    render(
      <CompleteProfileForm
        initialNeed=""
        initialHolderType=""
        initialPhone=""
        hasOrganization={false}
        backHref="/spaces/demo/booking"
      />
    );
    chooseRadio("Je cherche un espace");
    chooseRadio("Un particulier");
    fireEvent.change(screen.getByLabelText("Téléphone"), { target: { value: "0600000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/account/complete-profile");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ need: "SEARCH", holderType: "INDIVIDUAL", phone: "0600000000" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/spaces/demo/booking"));
  });
});
