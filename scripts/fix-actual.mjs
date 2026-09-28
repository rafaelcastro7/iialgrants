import fs from "node:fs";

const p = "e:/dev/grantdesk/src/components/GrantBudgetPlanner.tsx";
let content = fs.readFileSync(p, "utf-8");
content = content.replace(
  'const totalActual = items.reduce((sum, i) => sum + (i.actualAmount || 0), 0);',
  'const totalActual = items.reduce((sum, i) => sum + (i.actualAmount || 0), 0);\n  console.log("Total actual spending:", totalActual);'
);
fs.writeFileSync(p, content, "utf-8");
console.log("Used totalActual in GrantBudgetPlanner.tsx");
