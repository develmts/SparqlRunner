import { ConfigManager } from './src/config'
import { SparqlRunner} from './src/sparqlRunner'
import {runCli } from './src/cli/sparqlRunnerCli'



if (process.argv.length < 3){
  ConfigManager.config(process.cwd())
  const runner = new SparqlRunner({
    rate: 1,
    queriesPerSeed: 1,
    exec: true,
    locale: "en",
    outputPath: process.cwd()
  })
}else{
  const cli = import ( './src/cli/sparqlRunnerCli')
  ConfigManager.config(process.cwd())

  // runCli(process.argv)
  runCli()
}