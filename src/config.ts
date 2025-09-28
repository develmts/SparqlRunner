/**
 * Default configuration reference (do not export).
 * Each field has a short explanation of its purpose.
 * This section is commented out — it serves only as documentation
 * for users who want to know what each option does.
 */

/*
const default = {
  // Global verbose flag: if true, enable debug logging
  verbose: false,

  // Default locale for SPARQL queries and labels
  locale: "en-US",

  // Paths (directories relative to project root, unless absolute)
  paths: {
    // Output directory for generated files
    out: "",   // cannot be defined here
    // Directory for source input data
    sources: "data/sources/",
    // Directory for SQL schemas or migrations
    sql: "data/sql/",
  },

  // Wikidata endpoint settings
  wikidata: {
    // Base URL for SPARQL queries
    endpoint: "https://query.wikidata.org/sparql",
  },

  // HTTP client options
  http: {
    // Request timeout in milliseconds
    timeoutMs: 15000,
    // Maximum number of retries on failure
    retries: 2,
    // Backoff delay in milliseconds between retries
    backoffMs: 500,
    // User-Agent string sent with requests
    userAgent: "GivenNamesBot/1.0 (...)",
  },

  // SPARQL-related configuration
  sparql: {
    // Delay between queries in milliseconds (rate limiting)
    rateLimitMs: 1000,
  },
};
*/

/**
 * User configuration overrides.
 * Only override the fields you need to change.
 */
export const config = {
  // Example overrides:
  // verbose: true,
  // locale: "ca-ES",
  // sparql: { rateLimitMs: 500 },
};
