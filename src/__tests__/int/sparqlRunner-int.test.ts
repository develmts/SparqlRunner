import { SparqlRunner } from "../../sparqlRunner";

// Utility to mock global.fetch
function mockFetchOnce(response: any, ok = true, status = 200, statusText = "OK") {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: async () => response,
  });
}

describe("SparqlRunner Integration-ish (mocked fetch)", () => {
  describe("runQuery()", () => {
    test("returns parsed JSON when fetch is ok", async () => {
      const mockResponse = { results: { bindings: [{ foo: { value: "bar" } }] } };
      mockFetchOnce(mockResponse);

      const result = await (SparqlRunner as any).runQuery("SELECT * WHERE {}");
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalled();
    });

    test("throws error when fetch fails", async () => {
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      });

      await expect(
        (SparqlRunner as any).runQuery("SELECT * WHERE {}")
      ).rejects.toThrow("Error SPARQL 500: Server Error");
    });
  });

  describe("resolveNameQueries()", () => {
    test("returns qid=null when no lookup results", async () => {
      // mock runQuery sequentially: lookup returns []
      (SparqlRunner as any).runQuery = jest.fn().mockResolvedValueOnce({
        results: { bindings: [] },
      });

      const result = await (SparqlRunner as any).resolveNameQueries("NonExistentName", "en");
      expect(result.qid).toBeNull();
      expect(result.variants).toEqual([]);
      expect(result.translations).toEqual([]);
    });

    test("returns qid, variants and translations when all queries succeed", async () => {
      // Step 1: lookup → returns QID
      (SparqlRunner as any).runQuery = jest.fn()
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

      const result = await (SparqlRunner as any).resolveNameQueries("Rosa", "en");

      expect(result.qid).toBe("Q123");
      expect(result.variants).toContain("AltName");
      expect(result.translations).toEqual([{ lang: "es", label: "Nombre" }]);
    });
  });
});
