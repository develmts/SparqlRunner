import dotenv from "dotenv";
import minimist from "minimist";
import path from "path";

dotenv.config({quiet:true});

export interface AppConfig {
  // Arrel de càlcul de rutes
  rootPath?: string;

  // General
  verbose: boolean;
  locale: string;

  // Paths (DIRECTORIS, relatius a rootPath quan venen de config)
  paths: {
    out: string;
    sources: string;
    sql: string;
  };

  // Fitxer de seeds a usar (OPCIONAL): només el NOM dins de paths.sources
  // seedsFile: string | null;
  
  // sparql config
  sparql: {               // 👈 afegim nova secció
    rateLimitMs: number;  // delay entre consultes
  };
  test: {
    fromDefault: string
    fromEnv : string
    external: string
  }

  // DB
  // db: {
  //   driver: "sqlite" | "postgres" | "mysql";
  //   file: string;     // absolute (normalitzed)
  //   url?: string;
  //   schemaFile: string; 
  // };

  // Crawler
  // crawler: {
  //   userAgent: string;
  //   timeoutMs: number;
  //   maxRetries: number;
  //   delayMs: number;
  //   defSeed: string;   // nom per defecte (sense path)
  //   maxPages: number;  // 0 = il·limitat
  //   headed: boolean;   // Playwright UI (true) o headless (false)
  // };

  // Importer
  // importer: {
  //   batchSize: number;
  //   skipDuplicates: boolean;
  //   dryRun: boolean;  
  // };


  // server: ServerConfig

}


// Defaults (relatius; es normalitzen contra rootPath en el get())
const configDefault: AppConfig = {
  verbose: false,
  locale: "en-US",
  paths: {
    out: "data/raw/",
    sources: "data/sources/",
    sql: "data/sql/",
  },

  // seedsFile: null as string | null,
  sparql: {
    rateLimitMs:  1000, // 👈 per CLI --rateLimit=2000
  },
  
  test: {
    fromDefault: "fromdefault",
    fromEnv : "fromEnv.default",
    external: "xternal.default"
  }


  // db: {
  //   driver: "sqlite" as const,
  //   file: "data/db/givennames_v4.sqlite",
  //   url: undefined as string | undefined,
  //   schemaFile: "data/sql/schema_givennames-normalized_v4.sql"
  // },

  // crawler: {
  //   userAgent: "GivenNamesBot/4.0 (+https://example.org/bot)",
  //   timeoutMs: 15000,
  //   maxRetries: 3,
  //   delayMs: 0,
  //   defSeed: "default.txt",
  //   maxPages: 0,
  //   headed: false,
  // },

  // importer: {
  //   batchSize: 500,
  //   skipDuplicates: true,
  //   dryRun: false,
  // },

  // clustering: {
  //   enabled: false,
  //   method: "embeddings" as const,
  // },
};

// Helpers
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
 * Normalize a raw CLI key:
 * - Converts camelCase into dot.notation (dbPort -> db.port).
 * - Keeps existing dots as-is (db.port -> db.port).
 */
function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2") // insert dot before uppercase
    .toLowerCase(); // make all lowercase for consistency
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
export function parseCmdLine<T extends Record<string, any>>(): Partial<T> {
  const args = minimist(process.argv.slice(2));
  const result: any = {};

  for (const rawKey of Object.keys(args)) {
    if (rawKey === "_") continue; // ignore positional args

    const normKey = normalizeKey(rawKey);
    const value = args[rawKey];
    const path = normKey.split(".");

    let current: any = result;
    let currentDefault: any = configDefault;

    for (let i = 0; i < path.length; i++) {
      const part = path[i];
      const isLast = i === path.length - 1;

      if (isLast) {
        const defVal = currentDefault?.[part];
        if (typeof defVal === "number") {
          const parsed = parseFloat(value);
          current[part] = isNaN(parsed) ? defVal : parsed;
        } else if (typeof defVal === "boolean") {
          const lowered = String(value).toLowerCase();
          current[part] = lowered === "true" || lowered === "1";
        } else {
          current[part] = value;
        }
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
        currentDefault = currentDefault?.[part] ?? {};
      }
    }
  }
  console.log("Parsed",result)
  return result as Partial<T>;
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
export function mapConfig<T extends Record<string, any>>(
  prefix: string[] = [],
  // defs: any = configDefault,
  cmdLine: any = [] //parseCmdLine()
): T {
  const result: any = Array.isArray(configDefault) ? [] : {};
  //const cmdLine: Partial<AppConfig> = parseCmdLine(); // <--- now handled internally

  for (const key of Object.keys(configDefault)) {
    const defVal = configDefault[key];
    const cmdVal = (cmdLine as any)?.[key];
    const path = [...prefix, key];
    const varName = nameToEnv(path.join("."));
    const envVal = process.env[varName];

    if (defVal !== null && typeof defVal === "object" && !Array.isArray(defVal)) {
      // Recurse into nested objects
      // result[key] = mapConfig(defVal, cmdVal || {}, path);
      result[key] = mapConfig(path, cmdLine);
    } else if (cmdVal !== undefined) {
      // 1) Highest priority: cmdLine
      result[key] = cmdVal;
    } else if (envVal !== undefined) {
      // 2) Next priority: env var, parsed to match default type
      if (typeof defVal === "number") {
        const parsed = parseFloat(envVal);
        result[key] = isNaN(parsed) ? defVal : parsed;
      } else if (typeof defVal === "boolean") {
        const lowered = envVal.toLowerCase();
        result[key] = lowered === "true" || lowered === "1";
      } else {
        result[key] = envVal; // keep string as-is
      }
    } else {
      // 3) Fallback: defaults
      result[key] = defVal;
    }
  }

  return result as T;
}


function configFactory(rootPath: string, etxCfg = {}): AppConfig {
 let cfg = configDefault as AppConfig
 
 

//  console.log(Object.keys(cfg).length)
//  for (const k of Object.keys(cfg)){
//   console.log(k, cfg[k])
//  }

  cfg = mapConfig()
  cfg["rootPath"] = rootPath

 return cfg
}

export class ConfigManager {
  private static instance: Readonly<AppConfig>;

  static config(rootPath?: string, extCfg:Partial<AppConfig> = {}): Readonly<AppConfig> {
    if (!ConfigManager.instance) {
      if (!rootPath) {
        throw new Error("[ConfigManager] rootPath is required on first call to ConfigManager.config()");
      }
      ConfigManager.instance = Object.freeze(configFactory(rootPath, extCfg));
    }
    // console.log(ConfigManager.instance)
    return ConfigManager.instance;
  }
}
//configFactory("./")