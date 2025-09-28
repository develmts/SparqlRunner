import { SparqlRunner } from "../../sparqlRunner";

describe("SemanticQuery", () => {
  test("includes all provided concept QIDs in the VALUES clause", () => {
    const query = SparqlRunner.semanticQuery({ conceptQids: ["Q506", "Q756", "Q729"] });

    expect(query).toContain("VALUES ?concept { wd:Q506 wd:Q756 wd:Q729 }");
  });

  test("respects custom languages while keeping order", () => {
    const query = SparqlRunner.semanticQuery({
      conceptQids: ["Q506"],
      languages: ["ca", "en", "es"],
    });

    expect(query).toContain(
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "ca,en,es". }'
    );
  });

  test("uses the default language list when none is provided", () => {
    const query = SparqlRunner.semanticQuery({ conceptQids: ["Q506"] });

    expect(query).toContain(
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,ca,fr,de". }'
    );
  });

  test("applies the specified limit and defaults to 200", () => {
    const customLimitQuery = SparqlRunner.semanticQuery({
      conceptQids: ["Q506"],
      limit: 75,
    });
    const defaultLimitQuery = SparqlRunner.semanticQuery({ conceptQids: ["Q506"] });

    expect(customLimitQuery.trim().endsWith("LIMIT 75")).toBe(true);
    expect(defaultLimitQuery.trim().endsWith("LIMIT 200")).toBe(true);
  });
});