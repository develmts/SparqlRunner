// vitest.setup.ts
import { beforeAll, afterAll } from "vitest";

let originalArgv: string[];

beforeAll(() => {
  // Save original argv
  originalArgv = process.argv.slice();

  // Inject required CLI flag so ConfigManager policy is satisfied
  if (!process.argv.includes("--paths.out")) {
    process.argv = ["node", "test", "--paths.out", "./tmp", ...process.argv.slice(2)];
  }
});

afterAll(() => {
  // Restore original argv after all tests
  process.argv = originalArgv;
});
