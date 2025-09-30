/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "path"

export default defineConfig({
  test: {
    globals: true,             // permet `test`, `expect`, `describe` sense imports
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",       // tenim projectes CLI, no browser
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",          // usa motor built-in de Node
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage"
    }
  },

  resolve : {
    alias : {
      "@" : path.resolve(__dirname, "./src")
    }
  }
});