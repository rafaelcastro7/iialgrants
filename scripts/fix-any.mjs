import fs from "node:fs";

const p = "e:/dev/grantdesk/src/routes/clients_.$clientId.proposals.$grantId.tsx";
let c = fs.readFileSync(p, "utf-8");
c = c.replace(
  "sections.map((s: any) =>",
  "sections.map((s: { heading?: string; content?: string | null }) =>"
);
fs.writeFileSync(p, c, "utf-8");
console.log("Fixed any type in clients_.$clientId.proposals.$grantId.tsx!");
