import { fetchRegionalDevelopmentFunders } from "../src/lib/source-curator/regional-development.server";

const candidates = await fetchRegionalDevelopmentFunders();
console.log(`${candidates.length} candidates`);
for (const c of candidates) {
  console.log(`- ${c.name} (${c.province ?? "federal"}) :: ${c.website}`);
}
