import { runSourceCurator, type Tier } from "../src/lib/source-curator/orchestrator.server";

const requested = (process.argv[2] ?? "all") as Tier;
if (!["A", "B", "C", "scout", "all"].includes(requested)) {
  throw new Error("Usage: bun scripts/run-source-curator.ts [A|B|C|scout|all]");
}

const result = await runSourceCurator(requested);
console.log(JSON.stringify(result, null, 2));
if (result.totals.err > 0) process.exitCode = 1;

