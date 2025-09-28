import { ConfigManager } from './src/config'
import { SparqlRunner} from './src/sparqlRunner'
import {runCli } from './src/cli/sparqlRunnerCli'
ConfigManager.config(process.cwd())



if (process.argv.length < 3){
  const runner = new SparqlRunner({
    rate: 1,
    queriesPerSeed: 1,
    exec: true,
    locale: "en",
    outputPath: process.cwd()
  })
}else{
  const cli = import ( './src/cli/sparqlRunnerCli')
  runCli(process.argv)
}