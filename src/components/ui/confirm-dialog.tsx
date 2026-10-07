"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Confirmation before a destructive action (UX-22): refusing a booking
 * request, deleting a closure or a photo.
 *
 * `onConfirm` runs while the dialog stays open with both buttons disabled
 * (no double submission). It reports failure by returning an error message
 * or throwing: the message is shown inside the dialog, which stays open so
 * the user can retry or cancel — an error is never swallowed. On success the
 * dialog closes.
 *
 * `children` is rendered between the description and the buttons (e.g. an
 * optional "reason" field).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annuler",
  pendingLabel = "En cours…",
  destructive = true,
  onConfirm,
  onOpenChange,
  children,
}: {
  /** The element that opens the dialog — typically a <Button>. */
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<string | null | void> | string | null | void;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setError(null);
    onOpenChange?.(next);
  }

  async function confirm(event: React.MouseEvent) {
    // AlertDialog.Action closes on click by default; we close only once the
    // action has actually succeeded.
    event.preventDefault();
    setPending(true);
    setError(null);
    let failure: string | null = null;
    try {
      failure = (await onConfirm()) || null;
    } catch (caught) {
      failure =
        caught instanceof Error && caught.message
          ? caught.message
          : "L'action a échoué. Réessayez dans quelques instants.";
    }
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setOpen(false);
    onOpenChange?.(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction destructive={destructive} disabled={pending} onClick={confirm}>
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
