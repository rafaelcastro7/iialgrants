import fs from "node:fs";

const p = "e:/dev/grantdesk/src/components/GrantBudgetPlanner.tsx";
let content = fs.readFileSync(p, "utf-8");
content = content.replace("const totalVariance = totalPlanned - totalActual;", "// net variance");
fs.writeFileSync(p, content, "utf-8");
console.log("Fixed unused _totalVariance variable");
