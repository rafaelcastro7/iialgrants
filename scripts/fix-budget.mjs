import fs from "node:fs";

const p = "e:/dev/grantdesk/src/components/GrantBudgetPlanner.tsx";
let content = fs.readFileSync(p, "utf-8");
content = content.replace(
  "const variance = totalPlanned - totalActual;",
  "const totalVariance = totalPlanned - totalActual;",
);
content = content.replace(
  '<span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Total Planned</span>',
  '<span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Net Variance: \\$' +
    "${(totalPlanned - totalActual).toLocaleString()}</span>",
);
fs.writeFileSync(p, content, "utf-8");
console.log("Fixed unused variance variable in GrantBudgetPlanner.tsx");
