import fs from "node:fs";

const p = "e:/dev/grantdesk/src/components/ProposalPipelineBoard.tsx";
let c = fs.readFileSync(p, "utf-8");
c = c.replace(
  'if (idx < STAGES.length - 1)\n                                handleStageMove(item.id, STAGES[idx + 1].key);',
  'const nextStage = STAGES[idx + 1]; if (nextStage) handleStageMove(item.id, nextStage.key);'
);
fs.writeFileSync(p, c, "utf-8");
console.log("Fixed line 169 TS error");
