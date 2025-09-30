// src/__tests__/e2e/sparqlRunner-e2e.test.ts
import { describe, test, expect } from "vitest";
import { SparqlRunner } from "../../sparqlRunner.js";

/**
 * ⚠️ E2E tests
 * These tests hit the real Wikidata SPARQL endpoint.
 * They are skipped individually by default.
 * Remove `.skip` from the test you want to run manually.
 */
describe("SparqlRunner E2E", () => {
  const runner = new SparqlRunner({
    rate: 1,
    queriesPerSeed: 1,
    exec: true,
    locale: "en",
    outputPath: "./tmp",
  });

  test.skip("lookup should return QID for known given name", async () => {
    const result = await (runner as any).resolveNameQueries("Rosa", "en");
    expect(result.qid).toBeDefined();
    expect(result.qid).toMatch(/^Q[0-9]+$/);
  });

  test.skip("variants should return non-empty list for common name", async () => {
    const result = await (runner as any).resolveNameQueries("Maria", "en");
    expect(Array.isArray(result.variants)).toBe(true);
    expect(result.variants.length).toBeGreaterThan(0);
  });

  test.skip("translations should include multiple languages", async () => {
    const result = await (runner as any).resolveNameQueries("Josep", "ca");
    expect(result.translations.some((t: any) => t.lang === "es")).toBe(true);
  });
});
