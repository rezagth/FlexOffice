// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));

const { LoginForm } = await import("@/components/auth/login-form");
const { RegisterForm } = await import("@/components/auth/register-form");
const { BookingFunnel } = await import("@/components/booking/booking-funnel");

const fetchMock = vi.fn();

// Radix RadioGroup (booking funnel) measures itself; jsdom has no ResizeObserver.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginForm (UX-12, B-15)", () => {
  it("shows an error under each invalid field, wired with aria-invalid and aria-describedby", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    const email = await screen.findByLabelText("Email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    const describedBy = email.getAttribute("aria-describedby");
    expect(describedBy).toBe("email-error");
    expect(document.getElementById(describedBy!)?.textContent).toBe("Adresse e-mail invalide.");
    expect(screen.getByLabelText("Mot de passe").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toggles the password visibility with an accessible button", () => {
    render(<LoginForm />);
    const input = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    expect(input.type).toBe("password");
    const toggle = screen.getByRole("button", { name: "Afficher le mot de passe" });
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Masquer le mot de passe" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("links to the forgotten-password page", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "Mot de passe oublié ?" }).getAttribute("href")).toBe("/forgot-password");
  });
});

describe("RegisterForm (B-11, UX-12, SEC-15)", () => {
  function fillValid() {
    fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: "Sam Client" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "supersecret" } });
  }

  it("refuses to submit until the CGU/privacy box is ticked", async () => {
    render(<RegisterForm />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Vous devez accepter les CGU/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("links the CGU and the privacy policy, and shows the GDPR notice", () => {
    render(<RegisterForm />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/cgu");
    expect(hrefs).toContain("/confidentialite");
    expect(screen.getByText(/MakomSpace traite vos données/)).toBeTruthy();
  });

  it("sends acceptTerms and shows a message that does not say whether the address was new", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ emailConfirmationRequired: true }), { status: 201 }));
    render(<RegisterForm />);
    fillValid();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ acceptTerms: true });
    expect(await screen.findByText(/Si cette adresse n.est pas déjà associée à un compte/)).toBeTruthy();
  });

  it("maps server-side Zod issues back onto their fields", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "VALIDATION_ERROR", message: "Invalid input", issues: [{ path: ["email"], message: "Adresse e-mail invalide." }] },
        }),
        { status: 400 }
      )
    );
    render(<RegisterForm />);
    fillValid();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByRole("alert").textContent).not.toContain("Invalid input");
  });
});

describe("BookingFunnel (B-11, UX-17)", () => {
  const props = {
    spaceId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    spaceName: "Salle Atlas",
    date: "2030-03-04",
    capacity: 8,
    timeZone: "Europe/Paris",
    slots: [
      {
        kind: "MORNING" as const,
        available: true,
        priceCents: 9000,
        startsAt: "2030-03-04T08:00:00.000Z",
        endsAt: "2030-03-04T12:00:00.000Z",
      },
    ],
  };

  it("shows the French date, the slot hours and the cancellation terms in the recap", () => {
    render(<BookingFunnel {...props} />);
    fireEvent.click(screen.getByRole("radio"));
    expect(screen.getByText("lundi 4 mars 2030")).toBeTruthy();
    expect(screen.getByText(/9 h 00 – 13 h 00/)).toBeTruthy();
    expect(screen.getByText("Conditions d'annulation")).toBeTruthy();
    expect(screen.getByText(/frais de service MakomSpace ne sont pas remboursables/)).toBeTruthy();
  });

  it("does not send the request until the CGV are accepted, then sends acceptTerms", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ booking: {} }), { status: 201 }));
    render(<BookingFunnel {...props} />);
    fireEvent.click(screen.getByRole("radio"));
    fireEvent.change(screen.getByLabelText("Motif de la réservation"), { target: { value: "Réunion" } });

    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    expect(await screen.findByText(/accepter les conditions générales de vente/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ acceptTerms: true, slot: "MORNING" });
  });
});
