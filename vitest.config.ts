import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // No test files exist yet (they arrive in later tasks); exit 0 rather than
    // failing the suite when none are found.
    passWithNoTests: true,
  },
});
