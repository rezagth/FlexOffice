// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => "/app/landlord/spaces/abc",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { SubmitSpaceButton } = await import("@/components/dashboard/submit-space-button");
const { ReportSpaceButton } = await import("@/components/marketing/report-space-button");
const { TaxInfoForm } = await import("@/components/dashboard/tax-info-form");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

describe("SubmitSpaceButton — consentements juridiques", () => {
  const submitButton = () => screen.getByRole("button", { name: /soumettre pour validation/i });

  it("désactivé tant que les deux cases (CGV + droit sur le lieu) ne sont pas cochées", () => {
    render(<SubmitSpaceButton spaceId="s1" needsPartnerTerms />);
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/conditions générales de vente partenaires/i));
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/je certifie avoir le droit/i));
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("si les CGV sont déjà acceptées, seule la certification du lieu est demandée", () => {
    render(<SubmitSpaceButton spaceId="s1" needsPartnerTerms={false} />);
    expect(screen.queryByLabelText(/conditions générales de vente partenaires/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/je certifie avoir le droit/i));
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("envoie les consentements au serveur puis rafraîchit la page", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    render(<SubmitSpaceButton spaceId="s1" needsPartnerTerms />);
    fireEvent.click(screen.getByLabelText(/conditions générales de vente partenaires/i));
    fireEvent.click(screen.getByLabelText(/je certifie avoir le droit/i));
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/partner/spaces/s1/submit",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ acceptPartnerTerms: true, certifyRightToLet: true });
    expect(refresh).toHaveBeenCalled();
  });

  it("n'envoie pas acceptPartnerTerms quand il n'est pas demandé", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    render(<SubmitSpaceButton spaceId="s1" needsPartnerTerms={false} />);
    fireEvent.click(screen.getByLabelText(/je certifie avoir le droit/i));
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ certifyRightToLet: true });
  });

  it("affiche l'erreur du serveur et ne rafraîchit pas", async () => {
    fetchMock.mockResolvedValue(json(409, { error: { code: "LEGAL_ACCEPTANCE_REQUIRED", message: "Acceptation requise." } }));
    render(<SubmitSpaceButton spaceId="s1" needsPartnerTerms={false} />);
    fireEvent.click(screen.getByLabelText(/je certifie avoir le droit/i));
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Acceptation requise.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("profil incomplet côté serveur : propose le lien pour le compléter", async () => {
    fetchMock.mockResolvedValue(json(403, { error: { code: "PROFILE_INCOMPLETE", message: "Complétez votre profil." } }));
    render(<SubmitSpaceButton spaceId="s1" needsPartnerTerms={false} />);
    fireEvent.click(screen.getByLabelText(/je certifie avoir le droit/i));
    await act(async () => {
      fireEvent.click(submitButton());
    });
    const link = await screen.findByRole("link", { name: /compléter mon profil/i });
    expect(link.getAttribute("href")).toContain("/app/complete-profile?redirectTo=");
  });

  it("panne réseau : message clair", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<SubmitSpaceButton spaceId="s1" needsPartnerTerms={false} />);
    fireEvent.click(screen.getByLabelText(/je certifie avoir le droit/i));
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/réseau/i);
  });

  it("profil incomplet : bouton désactivé, cases masquées, éléments manquants listés", () => {
    render(<SubmitSpaceButton spaceId="s1" missingProfileItems={["le téléphone", "le type de compte"]} />);
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText(/je certifie avoir le droit/i)).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("le téléphone ; le type de compte");
  });
});

describe("ReportSpaceButton — signalement public", () => {
  it("n'affiche d'abord qu'un lien discret", () => {
    render(<ReportSpaceButton slug="salle-a" />);
    expect(screen.getByRole("button", { name: /signaler cette annonce/i })).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("ouvre le formulaire avec les 5 motifs, puis permet d'annuler", () => {
    render(<ReportSpaceButton slug="salle-a" />);
    fireEvent.click(screen.getByRole("button", { name: /signaler cette annonce/i }));
    expect(screen.getAllByRole("option")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /annuler/i }));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("envoie motif, message et e-mail (vide → omis)", async () => {
    fetchMock.mockResolvedValue(json(201, { ok: true }));
    render(<ReportSpaceButton slug="salle a/b" />);
    fireEvent.click(screen.getByRole("button", { name: /signaler cette annonce/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ILLEGAL" } });
    fireEvent.change(screen.getByLabelText(/que se passe-t-il/i), { target: { value: "Annonce frauduleuse évidente" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /envoyer le signalement/i }));
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/spaces/salle%20a%2Fb/report");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reason).toBe("ILLEGAL");
    expect(body.message).toBe("Annonce frauduleuse évidente");
    expect(body.email).toBeUndefined();
    expect((await screen.findByRole("status")).textContent).toMatch(/merci/i);
  });

  it("transmet l'e-mail rogné quand il est saisi", async () => {
    fetchMock.mockResolvedValue(json(201, {}));
    render(<ReportSpaceButton slug="s" />);
    fireEvent.click(screen.getByRole("button", { name: /signaler cette annonce/i }));
    fireEvent.change(screen.getByLabelText(/votre email/i), { target: { value: "  a@b.fr  " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /envoyer le signalement/i }));
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).email).toBe("a@b.fr");
  });

  it("affiche la première erreur de validation du serveur", async () => {
    fetchMock.mockResolvedValue(json(400, { error: { message: "x", issues: [{ message: "Expliquez en quelques mots." }] } }));
    render(<ReportSpaceButton slug="s" />);
    fireEvent.click(screen.getByRole("button", { name: /signaler cette annonce/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /envoyer le signalement/i }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Expliquez en quelques mots.");
  });

  it("limite de débit (429) : message du serveur, formulaire conservé", async () => {
    fetchMock.mockResolvedValue(json(429, { error: { code: "RATE_LIMITED", message: "Trop de signalements." } }));
    render(<ReportSpaceButton slug="s" />);
    fireEvent.click(screen.getByRole("button", { name: /signaler cette annonce/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /envoyer le signalement/i }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Trop de signalements.");
    expect(screen.getByRole("button", { name: /envoyer le signalement/i })).toBeTruthy();
  });

  it("panne réseau : message clair", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<ReportSpaceButton slug="s" />);
    fireEvent.click(screen.getByRole("button", { name: /signaler cette annonce/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /envoyer le signalement/i }));
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/réseau/i);
  });

  it("le champ message est limité à 3000 caractères", () => {
    render(<ReportSpaceButton slug="s" />);
    fireEvent.click(screen.getByRole("button", { name: /signaler cette annonce/i }));
    expect((screen.getByLabelText(/que se passe-t-il/i) as HTMLTextAreaElement).maxLength).toBe(3000);
  });
});

describe("TaxInfoForm — identité fiscale DAC7", () => {
  const initial = { taxResidenceCountry: "", taxIdentificationNumber: "", representativeBirthDate: "" };

  it("société : pas de champ date de naissance, indication SIREN", () => {
    render(<TaxInfoForm holderType="COMPANY" initial={initial} canEdit />);
    expect(screen.queryByLabelText(/date de naissance/i)).toBeNull();
    expect(screen.getByText(/son siren suffit/i)).toBeTruthy();
  });

  it("particulier : champ date de naissance présent", () => {
    render(<TaxInfoForm holderType="INDIVIDUAL" initial={initial} canEdit />);
    expect(screen.getByLabelText(/date de naissance/i)).toBeTruthy();
  });

  it("lecture seule : champs désactivés, pas de bouton, explication affichée", () => {
    render(<TaxInfoForm holderType="INDIVIDUAL" initial={initial} canEdit={false} />);
    expect((screen.getByLabelText(/pays de résidence fiscale/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /enregistrer/i })).toBeNull();
    expect(screen.getByText(/seul le propriétaire/i)).toBeTruthy();
  });

  it("le pays est limité à 2 caractères", () => {
    render(<TaxInfoForm holderType="COMPANY" initial={initial} canEdit />);
    expect((screen.getByLabelText(/pays de résidence fiscale/i) as HTMLInputElement).maxLength).toBe(2);
  });

  it("enregistre avec PATCH, omet les champs vides et rafraîchit", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    render(<TaxInfoForm holderType="COMPANY" initial={{ ...initial, taxResidenceCountry: "FR" }} canEdit />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/landlord/tax-info", expect.objectContaining({ method: "PATCH" }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.taxResidenceCountry).toBe("FR");
    expect(body.taxIdentificationNumber).toBeUndefined();
    expect(body.representativeBirthDate).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/enregistré/i));
    expect(refresh).toHaveBeenCalled();
  });

  it("un particulier envoie sa date de naissance, une société ne l'envoie jamais", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    const filled = { taxResidenceCountry: "FR", taxIdentificationNumber: "123", representativeBirthDate: "1985-07-04" };
    const { unmount } = render(<TaxInfoForm holderType="INDIVIDUAL" initial={filled} canEdit />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).representativeBirthDate).toBe("1985-07-04");
    unmount();
    fetchMock.mockClear();
    render(<TaxInfoForm holderType="COMPANY" initial={filled} canEdit />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).representativeBirthDate).toBeUndefined();
  });

  it("affiche l'erreur de validation du serveur et ne rafraîchit pas", async () => {
    fetchMock.mockResolvedValue(json(400, { error: { issues: [{ message: "Indiquez le code du pays sur 2 lettres." }] } }));
    render(<TaxInfoForm holderType="COMPANY" initial={initial} canEdit />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("2 lettres");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("panne réseau : message clair", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<TaxInfoForm holderType="COMPANY" initial={initial} canEdit />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/réseau/i);
  });
});
