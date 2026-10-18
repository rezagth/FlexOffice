/**
 * PRD V1.1, R44 — "la progression de l'inscription est sauvegardée
 * automatiquement par page ; reprise possible dans les 7 jours (même
 * navigateur) ; le mot de passe n'est jamais persisté."
 *
 * `WizardDraft` deliberately has no `password` field — the type itself is
 * what keeps a future edit here from persisting one by accident. Browser
 * storage only: there is no server-side draft, which is also why "même
 * navigateur" is an accurate description rather than an accidental
 * limitation.
 */

const STORAGE_KEY = "officeflex.signup_wizard.v1";
export const RESUME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type WizardDraft = {
  need?: "SEARCH" | "PUBLISH";
  holderType?: "INDIVIDUAL" | "COMPANY";
  activityType?: "OWNER" | "OPERATOR";
  isRealEstateProfessional?: boolean;
  name?: string;
  phone?: string;
  legalName?: string;
  siret?: string;
  siren?: string;
  vatNumber?: string;
  legalRepresentativeName?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  email?: string;
  acceptTerms?: boolean;
  // 2B, R53-R58 — "page 4", COMPANY only.
  domiciliationKind?: "MAKOMSPACE" | "THIRD_PARTY";
  domiciliataireName?: string;
  domiciliationAddress?: string;
  domiciliationCity?: string;
  domiciliationPostalCode?: string;
};

type StoredEnvelope = { savedAt: number; data: WizardDraft };

function isStoredEnvelope(value: unknown): value is StoredEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as StoredEnvelope).savedAt === "number" &&
    typeof (value as StoredEnvelope).data === "object"
  );
}

/** Null when there is nothing to resume: no draft, a corrupted one, or one
 * older than the resume window (expired drafts are also cleared here). */
export function loadSignupWizardDraft(now = Date.now()): WizardDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (!isStoredEnvelope(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (now - parsed.savedAt > RESUME_WINDOW_MS || parsed.savedAt > now + 60_000) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** Best-effort: a private window or blocked storage must never break the
 * wizard, it just loses the ability to resume. */
export function saveSignupWizardDraft(data: WizardDraft, now = Date.now()): void {
  try {
    const envelope: StoredEnvelope = { savedAt: now, data };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Nothing to do — see the function's own doc comment.
  }
}

export function clearSignupWizardDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
}
