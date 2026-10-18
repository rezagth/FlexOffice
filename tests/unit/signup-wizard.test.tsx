// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));

// Radix Checkbox (isRealEstateProfessional) measures itself; jsdom has no
// ResizeObserver — same stub as tests/unit/auth-forms.test.tsx.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// This sandbox's jsdom ships a non-functional `window.localStorage` — same
// stand-in as tests/unit/signup-wizard-storage.test.ts.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

const fetchMock = vi.fn();

const { SignupWizard } = await import("@/components/auth/signup-wizard");

beforeEach(() => {
  installLocalStorageStub();
  pushMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function clickNext() {
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
}

function chooseRadio(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

describe("SignupWizard", () => {
  it("blocks advancing from step 1 until a need is chosen", () => {
    render(<SignupWizard />);
    clickNext();
    expect(screen.getByText(/cherchez ou si vous publiez/)).not.toBeNull();
    expect(screen.queryByText("Vous êtes…")).toBeNull();
  });

  it(
    "regression: every applicable error on a step surfaces together, " +
      "even when 'accepter les CGU' (unrelated, a later step) is also unanswered",
    () => {
      // z.literal(true) on acceptTerms used to abort the whole schema parse
      // before superRefine ran, silently hiding every other page's errors
      // behind it whenever the CGU box was still unticked (which it always
      // is, this early in the form) — found by manually exercising the
      // wizard. signupWizardSchema uses z.boolean() + a superRefine check
      // instead specifically to avoid this.
      render(<SignupWizard />);
      chooseRadio("Je cherche un espace");
      clickNext();
      chooseRadio("Une société");
      clickNext();

      clickNext(); // step 3 "Informations", everything still empty

      expect(screen.getByText("Nom requis.")).not.toBeNull();
      expect(screen.getByText("Raison sociale requise.")).not.toBeNull();
      expect(screen.getByText("SIRET requis.")).not.toBeNull();
      expect(screen.getByText("Nom du représentant légal requis.")).not.toBeNull();
      expect(screen.getByText("Adresse requise.")).not.toBeNull();
      expect(screen.getByText("Ville requise.")).not.toBeNull();
      expect(screen.getByText("Code postal requis.")).not.toBeNull();
      // Still on step 3 — did not advance.
      expect(screen.queryByLabelText("Email")).toBeNull();
    }
  );

  it("shows company fields only for 'Société', never for 'Un particulier'", () => {
    render(<SignupWizard />);
    chooseRadio("Je cherche un espace");
    clickNext();
    chooseRadio("Un particulier");
    clickNext();

    expect(screen.queryByLabelText("Raison sociale")).toBeNull();
    expect(screen.queryByLabelText("SIRET")).toBeNull();
    // A plain individual tenant needs no address at all.
    expect(screen.queryByLabelText("Adresse")).toBeNull();
  });

  it("asks propriétaire/exploitant only when publishing, address for any publisher", () => {
    render(<SignupWizard />);
    chooseRadio("Je publie un espace");
    clickNext();

    expect(screen.getByRole("radio", { name: "Propriétaire" })).not.toBeNull();
    chooseRadio("Un particulier");
    chooseRadio("Propriétaire");
    clickNext();

    // Individual + PUBLISH still needs an address (it's the landlord's own
    // property), even with no company fields.
    expect(screen.queryByLabelText("Raison sociale")).toBeNull();
    expect(screen.getByLabelText("Adresse")).not.toBeNull();
  });

  it("offers the 'agence immobilière' checkbox only for a publishing company", () => {
    render(<SignupWizard />);
    chooseRadio("Je publie un espace");
    clickNext();
    chooseRadio("Une société");

    expect(screen.getByText(/carte professionnelle/)).not.toBeNull();
  });

  it("preserves answers when going back a step (R16)", () => {
    render(<SignupWizard />);
    chooseRadio("Je cherche un espace");
    clickNext();
    chooseRadio("Une société");
    clickNext();

    fireEvent.change(screen.getByLabelText("Raison sociale"), { target: { value: "Acme SARL" } });
    fireEvent.click(screen.getByRole("button", { name: "Précédent" }));
    fireEvent.click(screen.getByRole("button", { name: "Précédent" }));

    expect(screen.getByRole("radio", { name: "Je cherche un espace" }).getAttribute("aria-checked")).toBe(
      "true"
    );

    clickNext();
    clickNext();
    expect((screen.getByLabelText("Raison sociale") as HTMLInputElement).value).toBe("Acme SARL");
  });

  it("saves a draft after each step and offers to resume it on remount, minus the password", () => {
    const { unmount } = render(<SignupWizard />);
    chooseRadio("Je cherche un espace");
    clickNext();

    unmount();

    render(<SignupWizard />);
    expect(screen.getByText(/Reprise de votre inscription précédente/)).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Je cherche un espace" }).getAttribute("aria-checked")).toBe(
      "true"
    );

    const stored = JSON.parse(window.localStorage.getItem("officeflex.signup_wizard.v1")!);
    expect(stored.data).not.toHaveProperty("password");
  });

  it("'Recommencer à zéro' clears the draft and resets the form", () => {
    const { unmount } = render(<SignupWizard />);
    chooseRadio("Je publie un espace");
    clickNext();
    unmount();

    render(<SignupWizard />);
    fireEvent.click(screen.getByRole("button", { name: "Recommencer à zéro" }));

    expect(window.localStorage.getItem("officeflex.signup_wizard.v1")).toBeNull();
    expect(screen.queryByText(/Reprise de votre inscription/)).toBeNull();
  });

  it("submits a complete individual-tenant signup to /api/auth/register-wizard", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ emailConfirmationRequired: true }),
    });

    render(<SignupWizard />);
    chooseRadio("Je cherche un espace");
    clickNext();
    chooseRadio("Un particulier");
    clickNext();
    fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: "Jane Doe" } });
    clickNext();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.fr" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByLabelText(/J'accepte les/));

    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/register-wizard");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      need: "SEARCH",
      holderType: "INDIVIDUAL",
      name: "Jane Doe",
      email: "jane@example.fr",
      password: "longenoughpw",
      acceptTerms: true,
    });
    expect(body).not.toHaveProperty("siret");

    await waitFor(() => {
      expect(window.localStorage.getItem("officeflex.signup_wizard.v1")).toBeNull();
    });
  });
});
