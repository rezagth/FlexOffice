// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadSignupWizardDraft,
  saveSignupWizardDraft,
  clearSignupWizardDraft,
  RESUME_WINDOW_MS,
} from "@/lib/signup-wizard-storage";

// This sandbox's jsdom ships a non-functional `window.localStorage` (a bare
// object with no Storage prototype — confirmed not specific to this file,
// see tests/unit/consent-banner.test.tsx's pre-existing failure for the same
// reason). A minimal in-memory stand-in, same spirit as the ResizeObserver
// stub in tests/unit/auth-forms.test.tsx for a different missing jsdom API.
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

beforeEach(() => {
  installLocalStorageStub();
});

/** PRD V1.1, R44 — resume within 7 days, same browser, password never
 * persisted. */
describe("signup wizard draft storage", () => {
  it("round-trips a draft", () => {
    saveSignupWizardDraft({ need: "SEARCH", name: "Jane" });
    expect(loadSignupWizardDraft()).toEqual({ need: "SEARCH", name: "Jane" });
  });

  it("the WizardDraft type has no password field (compile-time, exercised at runtime too)", () => {
    const draft = { need: "SEARCH" as const, email: "jane@example.fr" };
    saveSignupWizardDraft(draft);
    const stored = JSON.parse(window.localStorage.getItem("officeflex.signup_wizard.v1")!);
    expect(stored.data).not.toHaveProperty("password");
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadSignupWizardDraft()).toBeNull();
  });

  it("returns null and clears storage past the 7-day resume window", () => {
    const now = Date.now();
    saveSignupWizardDraft({ name: "Jane" }, now);
    expect(loadSignupWizardDraft(now + RESUME_WINDOW_MS - 1)).toEqual({ name: "Jane" });
    expect(loadSignupWizardDraft(now + RESUME_WINDOW_MS + 1)).toBeNull();
    expect(window.localStorage.getItem("officeflex.signup_wizard.v1")).toBeNull();
  });

  it("returns null and clears storage for a malformed entry", () => {
    window.localStorage.setItem("officeflex.signup_wizard.v1", "not json");
    expect(loadSignupWizardDraft()).toBeNull();
    expect(window.localStorage.getItem("officeflex.signup_wizard.v1")).toBeNull();

    window.localStorage.setItem("officeflex.signup_wizard.v1", JSON.stringify({ foo: "bar" }));
    expect(loadSignupWizardDraft()).toBeNull();
  });

  it("clearSignupWizardDraft removes the entry", () => {
    saveSignupWizardDraft({ name: "Jane" });
    clearSignupWizardDraft();
    expect(loadSignupWizardDraft()).toBeNull();
  });

  it("rejects a saved-in-the-future timestamp (clock skew/tampering) rather than trusting it", () => {
    const now = Date.now();
    saveSignupWizardDraft({ name: "Jane" }, now + 10 * 60 * 1000);
    expect(loadSignupWizardDraft(now)).toBeNull();
  });
});
