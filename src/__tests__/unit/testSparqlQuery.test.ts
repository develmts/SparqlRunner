import { SparqlRunner } from "../../sparqlRunner";

describe("SparqlRunner.testSparqlQuery", () => {
  describe("lookup", () => {
    test("should include Q202444 and match the given name", () => {
      const q = SparqlRunner.testSparqlQuery("lookup", { name: "Rosa", locale: "en" });
      expect(q).toContain("wd:Q202444");
      expect(q).toContain('"Rosa"@en');
    });
  });

  describe("variants", () => {
    test("should include the provided QID in the query", () => {
      const q = SparqlRunner.testSparqlQuery("variants", { qid: "Q123" });
      expect(q).toContain("wd:Q123 wdt:P4970");
    });
  });

  describe("translations", () => {
    test("should include rdfs:label and BIND(LANG(?label))", () => {
      const q = SparqlRunner.testSparqlQuery("translations", { qid: "Q123" });
      expect(q).toContain("wd:Q123 rdfs:label ?label.");
      expect(q).toContain("BIND(LANG(?label) AS ?lang)");
    });
  })

  describe("semantic", () => {
    test("includes all provided concept QIDs in the VALUES clause", () => {
      const query =SparqlRunner.testSparqlQuery("semantic",{ conceptQids: ["Q506", "Q756", "Q729"] });

      expect(query).toContain("VALUES ?concept { wd:Q506 wd:Q756 wd:Q729 }");
    });

    test("respects custom languages while keeping order", () => {
      const query =SparqlRunner.testSparqlQuery("semantic",{
        conceptQids: ["Q506"],
        languages: ["ca", "en", "es"],
      });

      expect(query).toContain(
        'SERVICE wikibase:label { bd:serviceParam wikibase:language "ca,en,es". }'
      );
    });

    test("uses the default language list when none is provided", () => {
      const query =SparqlRunner.testSparqlQuery("semantic",{ conceptQids: ["Q506"] });

      expect(query).toContain(
        'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,ca,fr,de". }'
      );
    });

    test("applies the specified limit and defaults to 200", () => {
      const customLimitQuery =SparqlRunner.testSparqlQuery("semantic",{
        conceptQids: ["Q506"],
        limit: 75,
      });
      const defaultLimitQuery =SparqlRunner.testSparqlQuery("semantic",{ conceptQids: ["Q506"] });

      expect(customLimitQuery.trim().endsWith("LIMIT 75")).toBe(true);
      expect(defaultLimitQuery.trim().endsWith("LIMIT 200")).toBe(true);
    });
  })
});
