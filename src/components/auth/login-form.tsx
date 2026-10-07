"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fieldErrors, loginSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { focusFirstError } from "./form-errors";
import { PasswordInput } from "./password-input";

const FIELD_ORDER = ["email", "password"];

export function LoginForm({ redirectTo, notice }: { redirectTo?: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      focusFirstError(next, FIELD_ORDER);
      return;
    }
    setErrors({});

    setPending(true);
    // Goes through POST /api/auth/login rather than calling Supabase from the
    // browser, so the attempt is rate-limited and logged server-side. The
    // session cookies come back on that response and createBrowserClient
    // reads them, so client-side Supabase usage is unaffected.
    let response: Response;
    try {
      response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
    } catch {
      setPending(false);
      setFormError("Une erreur réseau est survenue. Réessayez.");
      return;
    }
    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      // 429 and 503 carry a message worth showing as-is; anything else gets
      // the deliberately uniform credentials message, which never reveals
      // whether the address exists.
      const message =
        response.status === 429 || response.status === 503
          ? (body?.error?.message ?? "Service momentanément indisponible.")
          : "Email ou mot de passe incorrect.";
      setFormError(message);
      return;
    }

    router.push(safeRedirectPath(redirectTo));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {notice && !formError && <FormMessage tone="info">{notice}</FormMessage>}
      {formError && <FormMessage tone="error">{formError}</FormMessage>}
      <FormField id="email" label="Email" error={errors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email", errors.email)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField id="password" label="Mot de passe" error={errors.password}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy("password", errors.password)}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <Link
        href="/forgot-password"
        className="self-end text-sm font-medium text-primary underline underline-offset-2"
      >
        Mot de passe oublié ?
      </Link>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
