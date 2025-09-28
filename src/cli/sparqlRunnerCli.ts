#!/usr/bin/env ts-node

import { ConfigManager } from "../config";
import minimist from "minimist";
import { SparqlRunner, SparqlRunnerCliOptions } from "../sparqlRunner";

interface ParsedArgs {
  file: string;
  options: Omit<SparqlRunnerCliOptions, "file">;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed = minimist(argv, {
    alias: {
      r: "rate",
      q: "queries",
      e: "exec",
      l: "locale",
      o: "output",
    },
    boolean: ["exec"],
    default: {
      rate: 1,
      queries: 1,
      exec: false,
    },
  });

  const file = parsed._[0];
  if (!file) {
    throw new Error("Ús: ts-node src/cli/sparqlRunnerCli.ts <fitxer.json> [--rate X] [--queries N] [--locale LL] [--output path] [--exec]");
  }

  const rate = typeof parsed.rate === "number" ? parsed.rate : Number(parsed.rate);
  const queries = typeof parsed.queries === "number" ? parsed.queries : Number(parsed.queries);

  const options: Omit<SparqlRunnerCliOptions, "file"> = {
    rate: Number.isFinite(rate) ? rate : undefined,
    queriesPerSeed: Number.isInteger(queries) ? queries : undefined,
    exec: Boolean(parsed.exec),
    locale: typeof parsed.locale === "string" ? parsed.locale : undefined,
    outputPath: typeof parsed.output === "string" ? parsed.output : undefined,
  };

  if (options.rate !== undefined && options.rate <= 0) {
    throw new Error("El paràmetre --rate ha de ser un número major que 0.");
  }

  if (options.queriesPerSeed !== undefined && options.queriesPerSeed <= 0) {
    throw new Error("El paràmetre --queries ha de ser un enter positiu.");
  }

  return { file, options };
}

// export async function runCli(argv: string[]): Promise<void> {
export async function runCli(): Promise<void> {
  const cfg = ConfigManager.config(process.cwd())
  if (cfg.verbose)
    console.dir(cfg)
  process.exit()
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
    return;
  }

  try {
    await SparqlRunner.runFromOptions({ file: parsed.file, ...parsed.options });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  // runCli(process.argv.slice(2));
  runCli()
}
