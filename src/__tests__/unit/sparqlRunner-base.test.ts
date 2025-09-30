// src/__tests__/unit/sparqlRunner-utils.test.ts
import { describe, test, expect } from "vitest";
import { SparqlRunner } from "../../sparqlRunner.js";

describe("SparqlRunner utility and edge-case behavior", () => {
  test("escapeQuotes should escape double quotes", () => {
    const input = 'He said "hello"';
    const output = (SparqlRunner as any).escapeQuotes(input);
    expect(output).toBe('He said \\"hello\\"');
  });

  test("resolveNameQueries returns null QID if lookup result has no item", async () => {
    // Mock runQuery: lookup → binding without `item`
    (SparqlRunner as any).runQuery = async () => ({
      results: { bindings: [{ somethingElse: { value: "junk" } }] },
    });

    const runner = new SparqlRunner({
      rate: 1,
      queriesPerSeed: 1,
      exec: false,
      locale: "en",
      outputPath: "./tmp",
    });

    const result = await (runner as any).resolveNameQueries("Foo", "en");
    expect(result.qid).toBeNull();
    expect(result.variants).toEqual([]);
    expect(result.translations).toEqual([]);
  });

  test("resolveNameQueries returns empty variants if variants query has no rows", async () => {

    const runner = new SparqlRunner({
      rate: 1,
      queriesPerSeed: 1,
      exec: false,
      locale: "en",
      outputPath: "./tmp",
    });

    (runner as any).runQuery = async (q: string) => {
      if (q.includes("wdt:P31")) {
        // lookup
        return {
          results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q999" } }] },
        };
      } else if (q.includes("variantLabel")) {
        return { results: { bindings: [] } }; // no variants
      } else {
        return { results: { bindings: [] } }; // no translations
      }
    };



    const result = await (runner as any).resolveNameQueries("Foo", "en");
    expect(result.qid).toBe("Q999");
    expect(result.variants).toEqual([]);
    expect(result.translations).toEqual([]);
  });

  test("resolveNameQueries parses translations correctly", async () => {
    const runner = new SparqlRunner({
      rate: 1,
      queriesPerSeed: 1,
      exec: false,
      locale: "en",
      outputPath: "./tmp",
    });
    (runner as any).runQuery = async (q: string) => {
      if (q.includes("wdt:P31")) {
        return {
          results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q777" } }] },
        };
      } else if (q.includes("variantLabel")) {
        return { results: { bindings: [] } };
      } else {
        return {
          results: {
            bindings: [
              { lang: { value: "fr" }, label: { value: "Nom" } },
              { lang: { value: "es" }, label: { value: "Nombre" } },
            ],
          },
        };
      }
    };



    const result = await (runner as any).resolveNameQueries("Foo", "en");
    expect(result.translations).toEqual([
      { lang: "fr", label: "Nom" },
      { lang: "es", label: "Nombre" },
    ]);
  });
});
