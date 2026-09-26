import { pathToFileURL } from 'node:url';
import { runPaperPipelineDemo } from './app/demo.js';
import { LIVE_EXECUTION_ENABLED } from './layers/execution.js';

export function main(): void {
  const summary = runPaperPipelineDemo();
  console.log(JSON.stringify({ app: 'TRADEDART', liveExecutionEnabled: LIVE_EXECUTION_ENABLED, ...summary }, null, 2));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
