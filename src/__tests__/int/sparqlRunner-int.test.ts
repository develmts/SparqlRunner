import { describe, test, expect ,vi, afterEach} from "vitest";
import { SparqlRunner } from "../../sparqlRunner.js";

// Utility to mock global.fetch
function mockFetchOnce(response: any, ok = true, status = 200, statusText = "OK") {
  (global as any).fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: async () => response,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SparqlRunner Integration-ish (mocked fetch)", () => {
  describe("runQuery()", () => {
    test("returns parsed JSON when fetch is ok", async () => {
      const mockResponse = { results: { bindings: [{ foo: { value: "bar" } }] } };
      mockFetchOnce(mockResponse);
      const runner = new SparqlRunner({
        rate: 1,
        queriesPerSeed: 1,
        exec: false,
        locale: "en",
        outputPath: "./tmp"
      });
      const result = await (runner as any).runQuery("SELECT * WHERE {}");
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalled();
    });

    test("throws error when fetch fails", async () => {
      (global as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      });
      const runner = new SparqlRunner({
        rate: 1,
        queriesPerSeed: 1,
        exec: false,
        locale: "en",
        outputPath: "./tmp"
      });      
      await expect(
        (runner as any).runQuery("SELECT * WHERE {}")
      ).rejects.toThrow("Error SPARQL 500: Server Error");
    });
  });

  describe("resolveNameQueries()", () => {
    test("returns qid=null when no lookup results", async () => {
      const runner = new SparqlRunner({
        rate: 1,
        queriesPerSeed: 1,
        exec: false,
        locale: "en",
        outputPath: "./tmp"
      });

      // mock runQuery sequentially: lookup returns []
      (runner as any).runQuery = vi.fn().mockResolvedValueOnce({
        results: { bindings: [] },
      });
      const result = await (runner as any).resolveNameQueries("NonExistentName", "en");
      expect(result.qid).toBeNull();
      expect(result.variants).toEqual([]);
      expect(result.translations).toEqual([]);
    });

    test("returns qid, variants and translations when all queries succeed", async (ctx) => {
      const runner = new SparqlRunner({
        rate: 1,
        queriesPerSeed: 1,
        exec: false,
        locale: "en",
        outputPath: "./tmp"
      });


      // Step 1: lookup → returns QID
      (runner as any).runQuery = vi.fn()
        // lookup
        .mockResolvedValueOnce({
          results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q123" } }] },
        })
        // variants
        .mockResolvedValueOnce({
          results: { bindings: [{ variantLabel: { value: "AltName" } }] },
        })
        // translations
        .mockResolvedValueOnce({
          results: { bindings: [{ lang: { value: "es" }, label: { value: "Nombre" } }] },
        });

      // try {
        const result = await (runner as any).resolveNameQueries("Rosa", "en");

        expect(result.qid).toBe("Q123");
        expect(result.variants).toContain("AltName");
        expect(result.translations).toEqual([{ lang: "es", label: "Nombre" }]);
      // } catch(err){
      //   if (err.message?.includes("SPARQL 500")) {
      //     // Mark test as skipped dynamically
      //     ctx.skip("Skipped: Wikidata server returned 500");
      //   } else {
      //     throw err; // real error → fail test
      //   }
      // }
    });
  });
});
