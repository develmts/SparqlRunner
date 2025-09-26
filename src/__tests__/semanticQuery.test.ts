import { buildSemanticQuery } from "../sparqlRunner";

describe("SemanticQuery", () => {
  it("includes all provided concept QIDs in the VALUES clause", () => {
    const query = buildSemanticQuery({ conceptQids: ["Q506", "Q756", "Q729"] });

    expect(query).toContain("VALUES ?concept { wd:Q506 wd:Q756 wd:Q729 }");
  });

  it("respects custom languages while keeping order", () => {
    const query = buildSemanticQuery({
      conceptQids: ["Q506"],
      languages: ["ca", "en", "es"],
    });

    expect(query).toContain(
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "ca,en,es". }'
    );
  });

  it("uses the default language list when none is provided", () => {
    const query = buildSemanticQuery({ conceptQids: ["Q506"] });

    expect(query).toContain(
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,ca,fr,de". }'
    );
  });

  it("applies the specified limit and defaults to 200", () => {
    const customLimitQuery = buildSemanticQuery({
      conceptQids: ["Q506"],
      limit: 75,
    });
    const defaultLimitQuery = buildSemanticQuery({ conceptQids: ["Q506"] });

    expect(customLimitQuery.trim().endsWith("LIMIT 75")).toBe(true);
    expect(defaultLimitQuery.trim().endsWith("LIMIT 200")).toBe(true);
  });
});