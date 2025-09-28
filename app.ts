import { ConfigManager } from "./src/ConfigManager";
import { SparqlRunner } from "./src/sparqlRunner";

// Initialize config (merges defaults, env, argv)
ConfigManager.config(process.cwd());

// Just delegate to SparqlRunner
SparqlRunner.runFromConfig();