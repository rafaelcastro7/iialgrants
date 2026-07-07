import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    // Machine-readable reports for CI artifact upload on failure.
    reporters: process.env.CI
      ? [
          ["default", { summary: false }],
          ["junit", { outputFile: "reports/vitest/junit.xml" }],
          ["json", { outputFile: "reports/vitest/results.json" }],
        ]
      : ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary", "html"],
      reportsDirectory: "coverage",
      // Scope coverage to the pipeline that the E2E suite actually exercises.
      // Untested UI code stays out of the gate so regressions in the wired
      // backend fail loudly without false alarms from unrelated files.
      include: [
        "src/agents/extractors/**/*.ts",
        "src/agents/fit-rules.server.ts",
        "src/agents/evidence.server.ts",
        "src/agents/enricher.functions.ts",
        "src/agents/evaluator.impl.server.ts",
        "src/agents/discoverer.impl.server.ts",
        "src/lib/notebooklm.functions.ts",
      ],
      exclude: ["**/*.test.ts", "**/__fixtures__/**", "**/*.d.ts"],
      // Hard floor — any regression that drops coverage below these levels
      // fails CI before it can land on main.
      // Hard floor — any regression that drops coverage below these levels
      // fails CI before it can land on main. Numbers are anchored slightly
      // below the current measured coverage so improvements stick and only
      // real regressions (a meaningful drop) break the build.
      thresholds: {
        lines: 60,
        functions: 55,
        statements: 55,
        branches: 40,
      },
    },
  },
});
