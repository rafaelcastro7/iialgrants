import fs from "node:fs";

const p = "e:/dev/grantdesk/src/routes/clients.$clientId.tsx";
let content = fs.readFileSync(p, "utf-8");
content = content.replace("type ProposalItem,", "");
content = content.replace("type ProposalItem ", "");
fs.writeFileSync(p, content, "utf-8");
console.log("Cleaned unused import in clients.$clientId.tsx");
