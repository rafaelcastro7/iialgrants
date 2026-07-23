import { discoverFunderImpl } from "../src/agents/discoverer.impl.server";

const funderId = process.argv[2];
if (!funderId) throw new Error("Usage: bun scripts/test-discover-funder.ts <funderId>");

const result = await discoverFunderImpl(funderId);
console.log(JSON.stringify(result, null, 2));
