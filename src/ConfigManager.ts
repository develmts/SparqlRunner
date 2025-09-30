import dotenv from "dotenv";
import minimist from "minimist";
import path from "path";
import fs from "fs"

dotenv.config({quiet:true});

/*
// config.ts (arrel del default)
export const configDefault: AppConfig = {
  verbose: false,
  locale: "en-US",
  paths: { out: "data/raw/", sources: "data/sources/", sql: "data/sql/" },
  wikidata: { endpoint: "https://query.wikidata.org/sparql" },
  http: { timeoutMs: 15000, retries: 2, backoffMs: 500, userAgent: "GivenNamesBot/1.0 (...)" },
  sparql: { rateLimitMs: 1000 },
  test: { fromDefault: "fromdefault", fromEnv: "fromEnv.default", external: "external.default" }
};

*/

export interface AppConfig {
  // Arrel de càlcul de rutes
  rootPath?: string;

  // General
  verbose: boolean;
  locale: string;
  _args? : any

  // Paths (DIRECTORIS, relatius a rootPath quan venen de config)
  paths: {
    out: string;
    sources: string;
    sql: string;
  },
  wikidata: { 
    endpoint: string 
  },
  http: { 
    timeoutMs: number
    retries: number
    backoffMs: number
    userAgent: string
  },
  // sparql config
  sparql: {               // 👈 afegim nova secció
    rateLimitMs: number;  // delay entre consultes
  }
};

// Allowed sources: config (defaults), env, cli
type Source = "config" | "env" | "cli";

interface Policy {
  allowed: Source[]; // where overrides are allowed
  required?: boolean
}

export const configPolicy: Record<string, Policy> = {
  "verbose": { allowed: ["config", "cli"] },   // no env, only cli + defaults
  "locale": { allowed: ["config", "env", "cli"] }, 
  "paths.out": { allowed: ["config", "cli"] ,required: true}, // never via env
  "paths.sources": { allowed: ["config"] },    // only config, fixed
  "sparql.rateLimitMs": { allowed: ["config", "env", "cli"] },
  "wikidata.endpoint": { allowed: ["config", "env"] }, // not CLI
  "http.userAgent": { allowed: ["config", "env"] },    // not CLI
};


const configDefault: AppConfig = {
  verbose: false,
  locale: "en-US",
  _args : {},
  paths: {
    out: "./",  // shoud be defined on CLI
    sources: "data/sources/",
    sql: "data/sql/",
  },
  wikidata: { endpoint: "https://query.wikidata.org/sparql" },
  http: { timeoutMs: 15000, retries: 2, backoffMs: 500, userAgent: "GivenNamesBot/1.0 (...)" },
  sparql: {
    rateLimitMs:  1000, // 👈 per CLI --rateLimit=2000
  },
};

// Helpers


import userConfig from  "../config.js"  

const asBool = (v: any, fb: boolean) =>
  v === undefined || v === null ? fb :
  typeof v === "boolean" ? v :
  typeof v === "number" ? v !== 0 :
  typeof v === "string" ? ["true","1","yes","on"].includes(v.trim().toLowerCase()) :
  fb;

const asInt = (v: any, fb: number) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fb;
};


/**
 * Convert a variable name (camelCase + dot notation) into CONSTANT_CASE.
 *
 * Examples:
 *  - "variable"                -> "VARIABLE"
 *  - "myVariable"              -> "MY_VARIABLE"
 *  - "variable.complex"        -> "VARIABLE_COMPLEX"
 *  - "variable.moreComplex"    -> "VARIABLE_MORE_COMPLEX"
 *  - "userProfile.idNumber"    -> "USER_PROFILE_ID_NUMBER"
 *
 * Rules:
 * 1. Split on dots first.
 * 2. For each segment, insert underscores before uppercase letters.
 * 3. Replace dashes with underscores (if present).
 * 4. Uppercase everything.
 * 5. Join segments with underscores.
 */
export function nameToEnv(input: string): string {
  return input
    .split(".")
    .map(part =>
      part
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // break camelCase into snake_case
        .replace(/-/g, "_")                     // normalize dashes
        .toUpperCase()
    )
    .join("_");
}

/**
 * Normalize a raw CLI key.
 *
 * Rules:
 * - Dot notation is the only supported way to express nested keys.
 *   Example: "--sparql.rateLimitMs 4000"
 *
 * - CamelCase input (e.g. "--sparqlRateLimitMs 4000") is NOT supported.
 *   This is by design: trying to infer camelCase segments introduces
 *   ambiguity (e.g. HTTPServer vs HttpServer). To avoid errors, only
 *   use dot notation for nested configuration keys.
 *
 * - Keys are preserved exactly as passed (apart from minimist’s parsing).
 */
function normalizeKey(key: string): string {
  return key
}
/**
 * Parse command line arguments into a nested object
 * matching the structure of `defaults`.
 *
 * Supports both:
 *  - Dot notation (--db.port 5432)
 *  - camelCase (--dbPort 5432)
 *
 * Preserves types based on defaults (string, number, boolean).
 */
function parseCmdLine(): any {
  const args = minimist(process.argv.slice(2));
  const result: any = { _args: {} };

  const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);

  for (const rawKey of Object.keys(args)) {
    if (rawKey === "_") continue;

    const normKey = normalizeKey(rawKey); // e.g. sparqlRateLimitMs -> sparql.ratelimitms
    const value = args[rawKey];
    const path = normKey.split(".");

    let current: any = result;
    let currentDefault: any = configDefault;

    let recognized = true;

    for (let i = 0; i < path.length; i++) {
      const part = path[i];
      const isLast = i === path.length - 1;

      if (!isObj(currentDefault)) {
        recognized = false;
        break;
      }

      // find matching key in defaults (case-insensitive)
      const defPart = Object.keys(currentDefault).find(
        k => k.toLowerCase() === part.toLowerCase()
      );

      if (!defPart) {
        recognized = false;
        break;
      }

      if (isLast) {
        const defVal = currentDefault[defPart];
        if (typeof defVal === "number") {
          const parsed = parseFloat(String(value));
          current[defPart] = isNaN(parsed) ? defVal : parsed;
        } else if (typeof defVal === "boolean") {
          const lowered = String(value).toLowerCase();
          current[defPart] = lowered === "true" || lowered === "1";
        } else {
          current[defPart] = value;
        }
      } else {
        if (!isObj(current[defPart])) current[defPart] = {};
        current = current[defPart];
        currentDefault = currentDefault[defPart];
      }
    }

    if (!recognized) {
      // Place unknown args into nested _args object, using normalized path
      let cur: any = result._args;
      for (let i = 0; i < path.length; i++) {
        const part = path[i];
        const isLast = i === path.length - 1;
        if (isLast) {
          cur[part] = value; // minimist typing
        } else {
          if (!isObj(cur[part])) cur[part] = {};
          cur = cur[part];
        }
      }
    }
  }

  return result;
}


/**
 * Merge defaults, environment variables, and command line options into a result object.
 *
 * Priority order (highest → lowest):
 *   1. cmdLine: explicit values provided by the caller
 *   2. process.env: environment variables (converted to the type of the default)
 *   3. defaults: fallback values
 *
 * The output keeps the same structure as `defaults`.
 *
 * Type preservation rules:
 * - string stays string
 * - number parsed with parseFloat (if parsing fails, fallback to default)
 * - boolean: "true"/"1" → true, "false"/"0" → false (case-insensitive)
 */
// export function mapConfig<T extends Record<string, any>>(
//   prefix: string[] = [],
//   defs: any = configDefault,
//   cmdLine?: any , 
// ): T {
//   if (!prefix.length && cmdLine == undefined ) {
//     cmdLine = parseCmdLine();
//   }

//   const result: any = Array.isArray(defs) ? [] : {};
  
//   for (const key of Object.keys(defs)) {
//     const defVal = defs[key];
//     const cmdVal = (cmdLine as any)?.[key];
//     const path = [...prefix, key];
//     const varName = nameToEnv(path.join("."));
//     const envVal = process.env[varName];

//     if (defVal !== null && typeof defVal === "object" && !Array.isArray(defVal)) {
//       // Recurse into nested objects
//       // result[key] = mapConfig(defVal, cmdVal || {}, path);
//       result[key] = mapConfig(path, defVal, cmdLine?.[key] || {});
//     } else if (cmdVal !== undefined) {
//       // 1) Highest priority: cmdLine
//       result[key] = cmdVal;
//     } else if (envVal !== undefined) {
//       // 2) Next priority: env var, parsed to match default type
//       if (typeof defVal === "number") {
//         const parsed = parseFloat(envVal);
//         result[key] = isNaN(parsed) ? defVal : parsed;
//       } else if (typeof defVal === "boolean") {
//         const lowered = envVal.toLowerCase();
//         result[key] = lowered === "true" || lowered === "1";
//       } else {
//         result[key] = envVal; // keep string as-is
//       }
//     } else {
//       // 3) Fallback: defaults
//       result[key] = defVal;
//     }
//   }
//   // Preserve unrecognized args (_args) if present in cmds
//   if (!prefix.length && cmdLine && cmdLine._args && Object.keys(cmdLine._args).length > 0) {
//     result._args = cmdLine._args;
//   }
//   return result as T;
// }

export function mapConfig<T extends Record<string, any>>(
  prefix: string[] = [],
  defs: any = configDefault,
  cmdLine?: any,
): T {
  if (!prefix.length && cmdLine === undefined) {
    cmdLine = parseCmdLine();
  }

  const result: any = Array.isArray(defs) ? [] : {};

  for (const key of Object.keys(defs)) {
    const defVal = defs[key];
    const path = [...prefix, key];
    const dotKey = path.join("."); // dot-notation key
    const varName = nameToEnv(dotKey);
    const envVal = process.env[varName];
    const cmdVal = (cmdLine as any)?.[key];

    const policy = configPolicy[dotKey] || { allowed: ["config", "env", "cli"] };

    if (defVal !== null && typeof defVal === "object" && !Array.isArray(defVal)) {
      // Recurse into nested objects
      result[key] = mapConfig(path, defVal, cmdLine?.[key] || {});
    } else {
      let value: any = undefined;

      // 1) Highest priority: CLI
      if (cmdVal !== undefined && policy.allowed.includes("cli")) {
        value = cmdVal;
      }
      // 2) Next: ENV
      else if (envVal !== undefined && policy.allowed.includes("env")) {
        if (typeof defVal === "number") {
          const parsed = parseFloat(envVal);
          value = isNaN(parsed) ? defVal : parsed;
        } else if (typeof defVal === "boolean") {
          const lowered = envVal.toLowerCase();
          value = lowered === "true" || lowered === "1";
        } else {
          value = envVal;
        }
      }
      // 3) Fallback: config defaults
      else if (policy.allowed.includes("config")) {
        value = defVal;
      }

      result[key] = value;

      // If required but still undefined → throw
      if (value === undefined && policy.required) {
        throw new Error(
          `[Config] Missing required key "${dotKey}". Allowed sources: ${policy.allowed.join(", ")}`
        );
      }
    }
  }

  // Preserve unrecognized args (_args) if present in CLI
  if (!prefix.length && cmdLine && cmdLine._args && Object.keys(cmdLine._args).length > 0) {
    result._args = cmdLine._args;
  }

  return result as T;
}


/**
 * Load user configuration from config.json synchronously.
 * 
 * - Expects the file to export a plain JSON object
 *   with the same structure as config.js.
 * - If the file does not exist, returns an empty object.
 * - If parsing fails, throws an error.
 */
export function loadJsonConfig(rootPath: string): any {
  const jsonPath = path.resolve(rootPath, "config.json");

  if (!fs.existsSync(jsonPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`[Config] Failed to parse config.json: ${(err as Error).message}`);
  }
}

function configFactory(rootPath: string): AppConfig {
  let effectiveConfig : any 
  try {
    // // @ts-expect-error: userConfig may not exist if import was removed
    effectiveConfig = userConfig || {};
  } catch {
    effectiveConfig = loadJsonConfig(rootPath);
  }

  const baseDefaults = { ...configDefault, ...effectiveConfig };
  const cfg = mapConfig([], baseDefaults)
  cfg["rootPath"] = rootPath
  return cfg as AppConfig
}

export class ConfigManager {
  private static instance: Readonly<AppConfig>;

  static config(rootPath?: string, extCfg:Partial<AppConfig> = {}): Readonly<AppConfig> {

    if (!ConfigManager.instance) {
      if (!rootPath) {
        throw new Error("[ConfigManager] rootPath is required on first call to ConfigManager.config()");
      }
      ConfigManager.instance = Object.freeze(configFactory(rootPath));
    }
    return ConfigManager.instance;
  }
}


// console.log(
//   ConfigManager.config("/")
// )