#!/usr/bin/env ts-node
import { ConfigManager } from "./ConfigManager.js";
import * as fs from "fs";
import * as path from "path";

interface SeedsFile {
  seeds: string[];
}

export interface NameEnrichmentResult {
  qid: string | null;
  name: string;
  locale: string;
  variants: string[];
  translations: { lang: string; label: string }[];
}

export interface SparqlRunnerConfig {
  rate?: number;
  queriesPerSeed?: number;
  exec?: boolean;
  locale?: string;
  outputPath?: string;
}

export interface SparqlRunnerCliOptions extends SparqlRunnerConfig {
  file: string;
}

const DEFAULT_OUTPUT_PATH = path.resolve("data/raw/sparql_results.json");
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

export class SparqlRunner {
  private readonly rate: number;
  private readonly queriesPerSeed: number;
  private readonly exec: boolean;
  private readonly locale: string;
  private readonly outputPath: string;

  constructor(config: SparqlRunnerConfig = {}) {
    this.rate = config.rate ?? 1;
    this.queriesPerSeed = config.queriesPerSeed ?? 1;
    this.exec = config.exec ?? false;
    this.locale = config.locale ?? "en";
    this.outputPath = config.outputPath ? path.resolve(config.outputPath) : DEFAULT_OUTPUT_PATH;
  }

  // static async runFromOptions(options: SparqlRunnerCliOptions): Promise<NameEnrichmentResult[]> {
  //   const { file, ...config } = options;
  //   const runner = new SparqlRunner(config);
  //   return runner.run(file);
  // }

 /**
   * Initialize SparqlRunner from the global ConfigManager
   * and run it immediately.
   *
   * This is meant to replace the old sparqlRunnerCli.ts adapter.
   */
  static async runFromConfig() {
    const cfg = ConfigManager.config();
    if (!cfg.paths.out) {
      throw new Error("[SparqlRunner] paths.out must be provided via CLI (e.g. --paths.out=out.csv)");
    }
    const runner = new SparqlRunner({
      rate: cfg.sparql.rateLimitMs,
      queriesPerSeed: 1,          // abans venia hardcoded al CLI
      exec: true,                 // idem
      locale: cfg.locale,
      outputPath: cfg.paths.out,  // idem
    });

    return runner.run(cfg.paths.out);
  }



  async resolveName(name: string, locale: string = this.locale): Promise<NameEnrichmentResult> {
    return this.resolveNameQueries(name, locale);
  }

  async run(filePath: string): Promise<NameEnrichmentResult[]> {
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`No s'ha trobat l'arxiu: ${absPath}`);
    }

    const raw = fs.readFileSync(absPath, "utf-8");
    const data: SeedsFile = JSON.parse(raw);
    const seeds = data.seeds || [];
    const totalSeeds = seeds.length;

    const totalQueries = totalSeeds * this.queriesPerSeed;
    const seconds = totalQueries / this.rate;

    console.log("Estimació d'execució SPARQL");
    console.log(`- Seeds: ${totalSeeds}`);
    console.log(`- Consultes per seed: ${this.queriesPerSeed}`);
    console.log(`- Total consultes: ${totalQueries}`);
    console.log(`- Ràtio límit: ${this.rate.toFixed(2)} consultes/s`);
    console.log(`- Temps estimat: ${seconds.toFixed(1)} s (~${(seconds / 60).toFixed(1)} min)`);

    if (!this.exec) {
      console.log("\nEstimation Mode. Use --exec to force real queries.");
      return [];
    }

    console.log("\nExecuting real Queries...\n", seeds);

    if (!fs.existsSync(this.outputPath)) {
      throw new Error(`Output path ${this.outputPath} doesn't exist`);
    }

    const mergedResults: NameEnrichmentResult[] = [];

    for (const seed of seeds) {
      try {
        const seedResult = await this.resolveNameQueries(seed, this.locale);
        console.log(`${seed}: variants=${seedResult.variants.length}, translations=${seedResult.translations.length}`);
        mergedResults.push(seedResult);
      } catch (err) {
        console.error(`${seed}:`, err);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(String(err));
      }

      await new Promise((r) => setTimeout(r, 1000 / this.rate));
    }

    fs.writeFileSync(this.outputPath, JSON.stringify(mergedResults, null, 2), "utf-8");
    console.log(`\nGlobal file: ${this.outputPath} saved`);
    console.log("Done.");

    return mergedResults;
  }

/**
 * Build and return a semantic SPARQL query string.
 *
 * This is a public wrapper around the internal query builder,
 * intended for testing and advanced use cases.
 *
 * @param params.conceptQids - QIDs representing the semantic cluster (e.g. ["Q506", "Q756"]).
 * @param params.languages - Preferred languages in order of priority (defaults to ["en","es","ca","fr","de"]).
 * @param params.limit - Maximum number of results (default: 200).
 */
public static semanticQuery(params: {
  conceptQids: string[];
  languages?: string[];
  limit?: number;
}): string {
  return this.buildSemanticQuery(params); //  buildSemanticQuery continua private
}

// dins de la classe SparqlRunner
/**
 * Public helper for testing query builders.
 * 
 * Allows unit tests to validate the generated SPARQL without
 * exposing individual private builder functions as public API.
 *
 * @param type - The query type ("lookup" | "variants" | "translations" | "semantic")
 * @param params - Parameters specific to the builder
 */

            
public static testSparqlQuery(
    type: "lookup" | "variants" | "translations" | "semantic",
    params: any
  ): string {
    switch (type) {
      case "lookup":
        return this.buildLookupQuery(params.name, params.locale);
      case "variants":
        return this.buildVariantsQuery(params.qid);
      case "translations":
        return this.buildTranslationsQuery(params.qid);
      case "semantic":
        return this.buildSemanticQuery(params);
      default:
        throw new Error(`[SparqlRunner] Unknown test query type: ${type}`);
    }
  }

  private static asBindings(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.results?.bindings && Array.isArray(res.results.bindings)) return res.results.bindings;
    return [];
  }

  private static escapeQuotes(s: string) {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private static buildLookupQuery(name: string, locale: string): string {
    // const lang = (locale || "en").split(/[-_]/)[0];
    // const safe = name.toLowerCase();

    // normalize language code to primary subtag (en, ca, es, ...)
    const lang = (locale || "en").split(/[-_]/)[0];

    // escape quotes in the label literal
    const label = this.escapeQuotes(name);

    // default language preference (keep consistent across builders)
    const defaults = ["en", "es", "ca", "fr", "de"];

    // put requested lang first, then defaults, dedup while preserving order
    const langs = [lang, ...defaults].filter((v, i, a) => a.indexOf(v) === i).join(",");

    // return `
    //   SELECT ?item ?itemLabel WHERE {
    //     ?item wdt:P31 wd:Q202444.
    //     SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en,es,fr,ca". }
    //     FILTER(LCASE(?itemLabel) = "${safe}")
    //   }
    //   LIMIT 20
    // `;

    return `
    SELECT ?item ?itemLabel WHERE {
      ?item wdt:P31 wd:Q202444.                     # instance of given name
      ?item rdfs:label "${label}"@${lang}.          # exact label match with language tag
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${langs}". }
    }
    LIMIT 20
  `;


  }

  private static buildVariantsQuery(qid: string): string {
    return `
      SELECT ?variant ?variantLabel WHERE {
        wd:${qid} wdt:P4970 ?variant.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,ca,fr,de". }
      }
    `;
  }

  private static buildTranslationsQuery(qid: string): string {
    return `
      SELECT ?lang ?label WHERE {
        wd:${qid} rdfs:label ?label.
        BIND(LANG(?label) AS ?lang)
      }
    `;
  }
  
  async resolveNameQueries(name: string, locale: string): Promise<NameEnrichmentResult> {
    const safeName = SparqlRunner.escapeQuotes(name);
    console.log("solving", name, locale);

    let lookupBindings = SparqlRunner.asBindings(await this.runQuery(SparqlRunner.buildLookupQuery(safeName, locale)));
    if (lookupBindings.length === 0 && locale.toLowerCase() !== "en") {
      lookupBindings = SparqlRunner.asBindings(await this.runQuery(SparqlRunner.buildLookupQuery(safeName, "en")));
    }

    if (lookupBindings.length === 0) {
      console.log(`⚠️ No QID found for name="${name}" locale="${locale}"`);
      return { qid: null, name, locale, variants: [], translations: [] };
    }

    console.log(`🔍 Found ${lookupBindings.length} QID(s) for name="${name}" locale="${locale}"`);

    const first = lookupBindings[0];
    const itemUri: string | undefined = first?.item?.value;
    const qid = itemUri ? itemUri.split("/").pop() ?? null : null;

    if (!qid) {
      return { qid: null, name, locale, variants: [], translations: [] };
    }

    const variantBindings = SparqlRunner.asBindings(await this.runQuery(SparqlRunner.buildVariantsQuery(qid)));
    const variants = variantBindings
      .map((b) => b?.variantLabel?.value as string | undefined)
      .filter((v): v is string => !!v);

    const translationBindings = SparqlRunner.asBindings(await this.runQuery(SparqlRunner.buildTranslationsQuery(qid)));
    const translations = translationBindings
      .map((b) => {
        const lang =
          b?.lang?.value ??
          b?.label?.["xml:lang"] ??
          b?.label?.lang;
        const label = b?.label?.value as string | undefined;
        if (!lang || !label) return null;
        return { lang, label };
      })
      .filter((x): x is { lang: string; label: string } => !!x);

    return { qid, name, locale, variants, translations };
  }

  private async runQuery(query: string) {
    const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`;
    const UA = "GivenNamesBot/1.0 (https://github.com/develmts; develmts @ github dot com)";
    const res = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": UA,
      },
    });

    if (!res.ok) {
      throw new Error(`Error SPARQL ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Build a semantic-cluster SPARQL query for GIVEN NAMES.
   */
  private static buildSemanticQuery(options: {
    conceptQids: string[];
    languages?: string[];
    limit?: number;
  }): string {
    const {
      conceptQids,
      languages = ["en", "es", "ca", "fr", "de"],
      limit = 200,
    } = options;

    if (!conceptQids || conceptQids.length === 0) {
      throw new Error('SemanticQuery: options.conceptQids must be a non-empty array of QIDs (e.g., ["Q506"]).');
    }

    const values = conceptQids.map((q) => `wd:${q}`).join(" ");
    const langParam = languages.join(",");

    return `
SELECT DISTINCT
  ?item ?itemLabel
  ?origin ?originLabel
  ?concept ?conceptLabel
WHERE {
  ?item wdt:P31 wd:Q202444 .
  ?item wdt:P138 ?origin .
  VALUES ?concept { ${values} }
  {
    ?origin wdt:P279* ?concept .
  } UNION {
    ?origin wdt:P31 / wdt:P279* ?concept .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${langParam}". }
}
ORDER BY LCASE(STR(?itemLabel))
LIMIT ${limit}
`.trim();
  }
  /**
   * PubliC  helpers for testing
   */

  // public async testResolveNameQueries(name: string, locale: string){ 
  //   return this.resolveNameQueries(name, locale)
  // }

}

