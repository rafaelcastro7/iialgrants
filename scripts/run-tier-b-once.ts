import { runSourceCurator } from "../src/lib/source-curator/orchestrator.server";

const result = await runSourceCurator("B");
console.log(JSON.stringify(result, null, 2));
