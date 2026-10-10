"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fieldErrors, updateProfileSchema } from "@/lib/validation/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "./form-field";
import { focusFirstError, formErrorMessage, issuesToFieldErrors } from "./form-errors";

const ORDER = ["name", "phone"];

/** Name and phone (FCT-18). */
export function AccountProfileForm({ initialName, initialPhone }: { initialName: string; initialPhone: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = updateProfileSchema.safeParse({ name, phone });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      focusFirstError(next, ORDER);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(issuesToFieldErrors(body));
        setMessage({ tone: "error", text: formErrorMessage(body, "Vos informations n'ont pas pu être enregistrées.") });
        return;
      }
      setMessage({ tone: "success", text: "Vos informations ont été enregistrées." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <FormField id="name" label="Nom complet" error={errors.name}>
        <Input
          id="name"
          autoComplete="name"
          required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("name", errors.name)}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField id="phone" label="Téléphone (optionnel)" error={errors.phone}>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={describedBy("phone", errors.phone)}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormField>
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
