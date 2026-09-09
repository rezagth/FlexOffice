import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { MotionProvider } from "@/components/motion-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Headings only (see globals.css) — body copy stays on Inter, matching
// the Stitch mockup's own dual-typeface split rather than switching
// everything to Jakarta.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "OfficeFlex — Réservez un espace professionnel à la demande",
  description:
    "OfficeFlex connecte les entreprises qui ont des espaces sous-utilisés aux professionnels qui cherchent une salle de réunion, un bureau ou un espace de formation à la demi-journée ou à la journée.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={cn("h-full", "antialiased", "font-sans", inter.variable, jakarta.variable)}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
