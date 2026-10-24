import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" -> "./*" path alias so tests can import
      // modules the same way the app does (e.g. "@/lib/calc").
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // No test files exist yet (they arrive in later tasks); exit 0 rather than
    // failing the suite when none are found.
    passWithNoTests: true,
  },
});
