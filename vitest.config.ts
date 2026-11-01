import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // React plugin only needed for the handful of component tests
  // (tests/**/*.test.tsx) that render with @testing-library/react — plain
  // domain/route tests (.test.ts) never touch JSX and are unaffected.
  plugins: [react()],
  test: {
    // Default stays "node": fast, and correct for the vast majority of
    // tests here (domain logic, route handlers, mocked Prisma). A
    // component test opts into the DOM with a `// @vitest-environment
    // jsdom` comment at the top of its own file instead of paying the
    // jsdom cost globally.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Working localStorage under jsdom on Node 25+ (no-op on Node 22).
    setupFiles: ["tests/setup/jsdom-storage.ts"],
    // `pnpm test:coverage` (nécessite : pnpm add -D @vitest/coverage-v8).
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts", "src/lib/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/generated/**", "**/*.d.ts", "src/server/domains/spaces/mock-data.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
