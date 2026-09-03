"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFormError("Merci de renseigner un email et un mot de passe valides.");
      return;
    }

    setPending(true);
    // Goes through POST /api/auth/login rather than calling Supabase from the
    // browser, so the attempt is rate-limited and logged server-side. The
    // session cookies come back on that response and createBrowserClient
    // reads them, so client-side Supabase usage is unaffected.
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
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
      {formError && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
