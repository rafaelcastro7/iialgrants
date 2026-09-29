import fs from "node:fs";

// 1. ProposalDocumentExporter.tsx
const p1 = "e:/dev/grantdesk/src/components/ProposalDocumentExporter.tsx";
let c1 = fs.readFileSync(p1, "utf-8");
c1 = c1.replace(
  "navigator.clipboard.writeText(text);",
  "void navigator.clipboard.writeText(text);",
);
fs.writeFileSync(p1, c1, "utf-8");

// 2. clients_.$clientId.proposals.$grantId.tsx
const p2 = "e:/dev/grantdesk/src/routes/clients_.$clientId.proposals.$grantId.tsx";
let c2 = fs.readFileSync(p2, "utf-8");
c2 = c2.replace(
  'sections.map((s: any) => ({ heading: s.heading || "Section", content: s.content }))',
  'sections.map((s: { heading?: string; content?: string | null }) => ({ heading: s.heading || "Section", content: s.content }))',
);
fs.writeFileSync(p2, c2, "utf-8");

console.log("Fixed 2 ESLint lint errors!");
