"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/**
 * A date field that loads the new day as soon as it is changed, instead of
 * waiting for a "Voir les créneaux" click. The surrounding `<form>` stays a
 * plain GET form (the date lives in the URL, so the page is shareable and
 * works without JavaScript — the page keeps a <noscript> button for that).
 * An empty or out-of-range value is not submitted: the browser has already
 * refused it, and reloading with nothing would just reset the page.
 */
export function AutoSubmitDateInput(props: Omit<ComponentProps<typeof Input>, "type" | "onChange">) {
  return (
    <Input
      {...props}
      type="date"
      onChange={(event) => {
        const input = event.currentTarget;
        if (!input.value || !input.validity.valid) return;
        input.form?.requestSubmit();
      }}
    />
  );
}
