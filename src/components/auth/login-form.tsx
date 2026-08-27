"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@/lib/validation/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
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
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setPending(false);

    if (error) {
      setFormError("Email ou mot de passe incorrect.");
      return;
    }

    router.push(redirectTo || "/post-login");
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
