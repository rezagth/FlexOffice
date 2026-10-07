"use client";

import { useEffect } from "react";
import "./globals.css";
import { inter, jakarta } from "./fonts";

/**
 * Last-resort error page, for a failure in the root layout itself (B-19).
 * It replaces the whole document, so it brings its own <html>, styles and
 * fonts, and stays deliberately self-contained: no header (it reads the
 * session — possibly what just failed), no shared component that could fail
 * the same way. `metadata` is not supported here; the React <title> is.
 *
 * As in error.tsx, the error message is never displayed — only the digest,
 * which matches the server logs.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root error", error.digest ?? error.name);
  }, [error]);

  return (
    <html lang="fr" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <title>Erreur — OfficeFlex</title>
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <p className="text-lg font-semibold">OfficeFlex</p>
          <h1 className="text-2xl font-semibold">Le service est momentanément indisponible</h1>
          <p className="text-muted-foreground">
            Une erreur inattendue nous empêche d&apos;afficher le site. Réessayez dans quelques
            instants — si le problème persiste, écrivez-nous depuis la page contact.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Réessayer
            </button>
            {/* A plain link: a full page load, not a client navigation
                through the router that just failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-11 items-center rounded-full border border-input px-6 text-sm font-medium text-foreground hover:bg-muted"
            >
              Retour à l&apos;accueil
            </a>
          </div>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Référence : <span className="font-mono">{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
