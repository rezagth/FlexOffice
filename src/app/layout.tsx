import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OfficeFlex — Réservez un espace professionnel à la demande",
  description:
    "OfficeFlex connecte les entreprises qui ont des espaces sous-utilisés aux professionnels qui cherchent une salle de réunion, un bureau ou un espace de formation à la demi-journée ou à la journée.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
