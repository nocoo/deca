import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/e2e/**",
        "src/index.ts",
        "src/tools/coding-agent/claude-code.ts",
      ],
      thresholds: {
        statements: 90,
        functions: 90,
        lines: 90,
        branches: 80,
      },
    },
  },
});
