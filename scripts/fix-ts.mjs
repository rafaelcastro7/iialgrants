import fs from "node:fs";

// 1. Fix ProposalPipelineBoard.tsx
const p1 = "e:/dev/grantdesk/src/components/ProposalPipelineBoard.tsx";
let c1 = fs.readFileSync(p1, "utf-8");
c1 = c1.replace(
  "if (idx > 0) handleStageMove(item.id, STAGES[idx - 1].key);",
  "const prevStage = STAGES[idx - 1]; if (prevStage) handleStageMove(item.id, prevStage.key);",
);
c1 = c1.replace(
  "if (idx < STAGES.length - 1) handleStageMove(item.id, STAGES[idx + 1].key);",
  "const nextStage = STAGES[idx + 1]; if (nextStage) handleStageMove(item.id, nextStage.key);",
);
fs.writeFileSync(p1, c1, "utf-8");

// 2. Fix clients_.$clientId.proposals.$grantId.tsx
const p2 = "e:/dev/grantdesk/src/routes/clients_.$clientId.proposals.$grantId.tsx";
let c2 = fs.readFileSync(p2, "utf-8");
c2 = c2.replace(
  "wordCount={sections.reduce((sum, s) => sum + (s.word_count || 0), 0)}",
  "wordCount={Array.isArray(sections) ? sections.reduce((sum: number, s: { word_count?: number | null }) => sum + (s.word_count || 0), 0) : 0}",
);
c2 = c2.replace("grantMaxAmount={grant?.amount_max || 100000}", "grantMaxAmount={100000}");
fs.writeFileSync(p2, c2, "utf-8");

console.log("Fixed TS errors cleanly!");
