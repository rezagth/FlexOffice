import localFont from "next/font/local";

/**
 * Self-hosted typefaces (DEP-16).
 *
 * `next/font/google` downloaded the files from fonts.googleapis.com at build
 * time, so a build failed whenever Google was unreachable (CI behind a proxy,
 * an air-gapped runner) and the bundle depended on a third party. The same
 * files now live in ./fonts — latin subset only, as before — copied from the
 * npm packages @fontsource-variable/inter 5.3.0 and
 * @fontsource/plus-jakarta-sans 5.3.0. Both are SIL Open Font License 1.1,
 * see the LICENSE-*.txt files next to them.
 *
 * Defined once here and imported by both the root layout and global-error.tsx
 * (which renders its own <html> and cannot inherit the layout's classes).
 */
export const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

// Headings only (see globals.css) — body copy stays on Inter, matching the
// Stitch mockup's own dual-typeface split.
export const jakarta = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-jakarta",
  display: "swap",
});
