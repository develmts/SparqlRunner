#!/usr/bin/env ts-node

// Estimation mode
// ts-node sparqlRunner.ts cluster_seeds_all.json --rate 0.5 --queries 2
// run Mode 
// ts-node sparqlRunner.ts cluster_seeds_all.json --rate 0.5 --queries 1 --exec


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

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";


function asBindings(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (res.results?.bindings && Array.isArray(res.results.bindings)) return res.results.bindings;
  return [];
}

function escapeQuotes(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 *  SPARQL query Builders
 */
/**
 *  SPARQL simple: donat un nom, retorna els ítems amb label/alias igual.
 */
function buildQuery(name: string): string {
  return `
    SELECT ?item ?itemLabel WHERE {
      ?item rdfs:label "${name}"@en.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 20
  `;
}

// function buildLookupQuery(name: string, locale: string): string {
//   // Locale pot ser "en", "es", "ca"...
//   return `
//     SELECT ?item ?itemLabel WHERE {
//       ?item rdfs:label "${name}"@${locale}.
//       ?item wdt:P31 wd:Q202444. # instance of given name
//       SERVICE wikibase:label { bd:serviceParam wikibase:language "${locale},en". }
//     }
//     LIMIT 1
//   `;
// }

// function buildVariantsQuery(name: string): string {
//   return `
//     SELECT ?item ?itemLabel ?alias WHERE {
//       ?item wdt:P31 wd:Q202444.            # instance of given name
//       ?item rdfs:label "${name}"@en.
//       OPTIONAL { ?item skos:altLabel ?alias FILTER (LANG(?alias) = "en") }
//       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
//     }
//     LIMIT 50
//   `;
// }
/**
 * Build a SPARQL query to look up a given name in Wikidata.
 * It matches entities that are instances of "given name" (Q202444),
 * checking both rdfs:label and skos:altLabel.
 */
function buildLookupQuery(name: string, locale: string): string {
  const lang = locale.split(/[-_]/)[0]; // ex: "en" from "en_GB"

  const safe = name.toLowerCase()
  return `
    SELECT ?item ?itemLabel WHERE {
      ?item wdt:P31 wd:Q202444.   # given name
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en,es,fr,ca". }
      FILTER(LCASE(?itemLabel) = "${safe}")
    }
    LIMIT 20
  `;
}

function buildVariantsQuery(qid: string): string {
  return `
    SELECT ?variant ?variantLabel WHERE {
      wd:${qid} wdt:P4970 ?variant.  # alternate form (property P4970)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,ca,fr,de". }
    }
  `;
}

// function buildTranslationsQuery(name: string): string {
//   return `
//     SELECT ?item ?itemLabel ?lang ?label WHERE {
//       ?item wdt:P31 wd:Q202444.             # instance of given name
//       ?item rdfs:label ?label.
//       FILTER (STR(?label) = "${name}")
//       BIND(LANG(?label) AS ?lang)
//       SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
//     }
//     LIMIT 50
//   `;
// }

function buildTranslationsQuery(qid: string): string {
  return `
    SELECT ?lang ?label WHERE {
      wd:${qid} rdfs:label ?label.
      BIND(LANG(?label) AS ?lang)
    }
  `;
}

/**
 * Build a semantic-cluster SPARQL query for GIVEN NAMES.
 *
 * Goal
 * ----
 * Return given names (items of Q202444) that are *named after* (P138)
 * something that belongs to one or more root concepts (QIDs) you provide.
 * This lets you fetch clusters like “Flowers”, “Animals”, “Mythology”, “Celestial”, etc.
 *
 * How it works
 * ------------
 * - We restrict ?item to "given name" (wdt:P31 wd:Q202444).
 * - We require ?item wdt:P138 ?origin (the thing the name is named after).
 * - We check that ?origin is either:
 *      (A) a subclass (wdt:P279*) of any input concept, OR
 *      (B) an instance-of (wdt:P31) of something that is a subclass (wdt:P279*) of the concept.
 *   This UNION makes it robust for cases where origins are typed as instances vs subclasses.
 * - We expose labels for the name (?itemLabel), the origin (?originLabel), and the matched concept (?conceptLabel).
 *
 * Parameters
 * ----------
 * @param options.conceptQids   Array of root concept QIDs (WITHOUT the "wd:" prefix).
 *                              Examples:
 *                                - Animals:        Q729
 *                                - Plants:         Q756  (optionally Flowers: Q506)
 *                                - Gemstones:      Q83437
 *                                - Celestial obj.: Q6999 (also Star: Q523, Planet: Q634, Constellation: Q8928)
 *                                - Deities:        Q178885
 *                                - Saints:         Q43115
 *                              You can pass several at once, e.g. ['Q506','Q756'] for flowers+plants.
 *
 * @param options.languages     Preferred UI label languages for the label service.
 *                              Order matters; the first available will be used. Default: ['en','es','ca','fr','de'].
 *
 * @param options.limit         Max number of rows to return. Default: 200.
 *
 * @returns string              A ready-to-run SPARQL query.
 *
 * Notes / Caveats
 * ---------------
 * - Coverage depends on Wikidata quality: some given names may be missing P138 (named after),
 *   or their origin may not be well-typed. For “Virtues” or very abstract clusters,
 *   consider augmenting with curated lists or alternative patterns.
 * - If you need to broaden/narrow a cluster, adjust the concept QIDs (add/remove roots).
 * - Results are DISTINCT and ordered by case-insensitive item label.
 */
export function SemanticQuery(options: {
  conceptQids: string[];
  languages?: string[];
  limit?: number;
}): string {
  const {
    conceptQids,
    languages = ['en', 'es', 'ca', 'fr', 'de'],
    limit = 200,
  } = options;

  if (!conceptQids || conceptQids.length === 0) {
    throw new Error('SemanticQuery: options.conceptQids must be a non-empty array of QIDs (e.g., ["Q506"]).');
  }

  // Build VALUES list like:  VALUES ?concept { wd:Q506 wd:Q756 }
  const values = conceptQids.map(q => `wd:${q}`).join(' ');
  const langParam = languages.join(',');

  return `
SELECT DISTINCT
  ?item ?itemLabel
  ?origin ?originLabel
  ?concept ?conceptLabel
WHERE {
  # 1) Given name constraint
  ?item wdt:P31 wd:Q202444 .

  # 2) The given name is named after some origin
  ?item wdt:P138 ?origin .

  # 3) Root semantic concepts to match against (cluster seeds)
  VALUES ?concept { ${values} }

  # 4) Link the origin to the concept:
  #    (A) origin is a subclass of the concept
  # OR (B) origin is an instance of something that is a subclass of the concept
  {
    ?origin wdt:P279* ?concept .
  } UNION {
    ?origin wdt:P31 / wdt:P279* ?concept .
  }

  # 5) Multilingual labels (best-effort in the order provided)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${langParam}". }
}
ORDER BY LCASE(STR(?itemLabel))
LIMIT ${limit}
`.trim();
}


/**
 * Envia consulta SPARQL a Wikidata
 */
async function runQuery(query: string) {
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const UA = "GivenNamesBot/1.0 (https://github.com/develmts; develmts @ github dot com)"
  const res = await fetch(url, {
      headers: { 
        Accept: "application/sparql-results+json", 
        "User-Agent": UA,  
      }    
    }
  );

  if (!res.ok) {
    throw new Error(`Error SPARQL ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Resolució completa d'un nom: lookup + variants + translations
 */

async function resolveNameQueries(
  name: string,
  locale: string,
  // sparql: SparqlMgr
): Promise<NameEnrichmentResult> {
  const safeName = escapeQuotes(name);
  console.log("solving", name, locale)
  // 1) Lookup QID (primer amb locale, després fallback a 'en')
  let lookupBindings = asBindings(await runQuery(buildLookupQuery(safeName, locale)));
  if (lookupBindings.length === 0 && locale.toLowerCase() !== "en") {
    lookupBindings = asBindings(await runQuery(buildLookupQuery(safeName, "en")));
  }

  if (lookupBindings.length === 0) {
    // No s’ha trobat cap QID
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

  // 2) Variants
  const variantBindings = asBindings(await runQuery(buildVariantsQuery(qid)));
  const variants = variantBindings
    .map(b => b?.variantLabel?.value as string | undefined)
    .filter((v): v is string => !!v);

  // 3) Translations (labels per idioma)
  const translationBindings = asBindings(await runQuery(buildTranslationsQuery(qid)));
  const translations = translationBindings
    .map(b => {
      const lang =
        b?.lang?.value ??
        b?.label?.["xml:lang"] ?? // per si ve en aquest format
        b?.label?.lang;           // fallback extra
      const label = b?.label?.value as string | undefined;
      if (!lang || !label) return null;
      return { lang, label };
    })
    .filter((x): x is { lang: string; label: string } => !!x);

  return { qid, name, locale, variants, translations };
}


/**
 * Executa el procés complet
 */
async function run(
  filePath: string,
  rate: number = 1,
  queriesPerSeed: number = 1,
  exec: boolean = false
) {
  const absPath = path.resolve(filePath);

  const mergedResults: any[] = [];

  if (!fs.existsSync(absPath)) {
    throw new Error(`No s'ha trobat l'arxiu: ${absPath}`);
  }

  const raw = fs.readFileSync(absPath, "utf-8");
  const data: SeedsFile = JSON.parse(raw);
  const seeds = data.seeds || [];
  const totalSeeds = seeds.length;

  const totalQueries = totalSeeds * queriesPerSeed;
  const seconds = totalQueries / rate;

  console.log("📊 Estimació d'execució SPARQL");
  console.log(`- Seeds: ${totalSeeds}`);
  console.log(`- Consultes per seed: ${queriesPerSeed}`);
  console.log(`- Total consultes: ${totalQueries}`);
  console.log(`- Ràtio límit: ${rate.toFixed(2)} consultes/s`);
  console.log(`- Temps estimat: ${seconds.toFixed(1)} s (~${(seconds / 60).toFixed(1)} min)`);

  if (!exec) {
    console.log("\nℹ️ Mode estimació. Passa --exec per fer les consultes reals.");
    return;
  }

  console.log("\n🚀 Executant consultes reals...\n", seeds);

  for (const seed of seeds) {
    // const seedResult: any = { seed, queries: {} };
    let seedResult: NameEnrichmentResult = {
      qid: null,
      name: seed,
      locale: "en",
      variants: [],
      translations: [],
    };

    try {
      // const variantsResult = await runQuery(buildVariantsQuery(seed));
      // seedResult.queries.variants = variantsResult;

      // const translationsResult = await runQuery(buildTranslationsQuery(seed));
      // seedResult.queries.translations = translationsResult;

      seedResult =  await resolveNameQueries(seed, "en")
      console.log(`✅ ${seed}: variants=${seedResult.variants.length}, translations=${seedResult.translations.length}`);
      mergedResults.push(seedResult);
    } catch (err) {
      console.error(`❌ ${seed}:`, err);
      throw new Error (err as any);
    }

    // Respectar rate limiting
    await new Promise((r) => setTimeout(r, 1000 / rate));
  }

  const outPath = path.resolve("data/raw/sparql_results.json");
  fs.writeFileSync(outPath, JSON.stringify(mergedResults, null, 2), "utf-8");
  console.log(`\n💾 Guardat arxiu global: ${outPath}`);
  console.log("✅ Fi.");
}

/**
 * CLI
 */
function main(){
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Ús: ts-node sparqlRunner.ts <fitxer.json> [--rate X] [--queries N] [--exec]");
    process.exit(1);
  }

  const file = args[0];
  let rate = 1.0;
  let queries = 1;
  let exec = false;

  args.forEach((arg, idx) => {
    if (arg === "--rate" && args[idx + 1]) rate = parseFloat(args[idx + 1]);
    if (arg === "--queries" && args[idx + 1]) queries = parseInt(args[idx + 1], 10);
    if (arg === "--exec") exec = true;
  });

  run(file, rate, queries, exec);
}

main();