"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/dashboard/states";

/**
 * Error boundary for every route segment below the root.
 *
 * Required by the `getAuthContext()` hardening: that function now throws
 * `ServiceUnavailableError` when the authentication or database backend is
 * genuinely unreachable, instead of returning `null` and letting a real
 * outage look like a signed-out visitor. A throw needs somewhere to land, or
 * the visitor gets Next.js's raw error screen.
 *
 * The message stays generic on purpose — `error.message` is not rendered. In
 * production Next.js already redacts it, and echoing an internal message to
 * the browser is the same leak the API error envelope is careful to avoid.
 * The digest is shown so a user can quote it in a support request and it can
 * be matched against the server logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Browser-side console only: the server-side occurrence was already
    // logged with full context by the code that threw.
    console.error("Unhandled application error", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <ErrorState
        title="Service momentanément indisponible"
        description="Nous n'avons pas pu charger cette page. Réessayez dans quelques instants — si le problème persiste, contactez le support."
      />
      <div className="flex items-center justify-center gap-3">
        <Button onClick={reset} size="sm">
          Réessayer
        </Button>
      </div>
      {error.digest && (
        <p className="text-center text-xs text-muted-foreground">
          Référence : <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
