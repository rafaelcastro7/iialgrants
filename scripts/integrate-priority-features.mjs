import fs from "node:fs";
import path from "node:path";

const GRANTDESK_SRC = "e:/dev/grantdesk/src";

// 1. Update Nav.tsx to include link to Design System
const navPath = path.join(GRANTDESK_SRC, "components/Nav.tsx");
let navContent = fs.readFileSync(navPath, "utf-8");
if (!navContent.includes('to: "/design-system"')) {
  navContent = navContent.replace(
    '{ to: "/catalog", label: "Funder Coverage" },',
    '{ to: "/catalog", label: "Funder Coverage" },\n  { to: "/design-system", label: "Design Tokens" },',
  );
  fs.writeFileSync(navPath, navContent, "utf-8");
  console.log("Updated Nav.tsx with Design Tokens link!");
}

// 2. Update clients.$clientId.tsx to include GrantPrioritizationMatrix
const clientPath = path.join(GRANTDESK_SRC, "routes/clients.$clientId.tsx");
let clientContent = fs.readFileSync(clientPath, "utf-8");
if (!clientContent.includes("GrantPrioritizationMatrix")) {
  clientContent = clientContent.replace(
    'import { GrantBudgetPlanner } from "@/components/GrantBudgetPlanner";',
    'import { GrantBudgetPlanner } from "@/components/GrantBudgetPlanner";\nimport { GrantPrioritizationMatrix } from "@/components/GrantPrioritizationMatrix";',
  );
  const matrixSection = `
        {/* Prioritization Matrix */}
        <GrantPrioritizationMatrix
          grants={[
            {
              id: "m1",
              title: "Clean Technology Innovation Program",
              funderName: "Innovation Canada",
              amountMax: 150000,
              relevance: 0.92,
              requirementCount: 3,
              deadline: "2026-11-30",
            },
            {
              id: "m2",
              title: "Community Green Infrastructure Grant",
              funderName: "Ontario Trillium Foundation",
              amountMax: 75000,
              relevance: 0.88,
              requirementCount: 2,
              deadline: "2026-10-15",
            },
            {
              id: "m3",
              title: "Subsidies for Youth Employment",
              funderName: "ESDC Canada",
              amountMax: 35000,
              relevance: 0.75,
              requirementCount: 4,
              deadline: "2026-12-01",
            },
          ]}
        />
  `;
  clientContent = clientContent.replace(
    "<GrantBudgetPlanner grantMaxAmount={150000} />",
    `<GrantBudgetPlanner grantMaxAmount={150000} />\n${matrixSection}`,
  );
  fs.writeFileSync(clientPath, clientContent, "utf-8");
  console.log("Updated clients.$clientId.tsx with GrantPrioritizationMatrix!");
}

// 3. Update proposal editor to include ProposalDocumentExporter
const proposalPath = path.join(GRANTDESK_SRC, "routes/clients_.$clientId.proposals.$grantId.tsx");
let proposalContent = fs.readFileSync(proposalPath, "utf-8");
if (!proposalContent.includes("ProposalDocumentExporter")) {
  proposalContent = proposalContent.replace(
    'import { GrantBudgetPlanner } from "@/components/GrantBudgetPlanner";',
    'import { GrantBudgetPlanner } from "@/components/GrantBudgetPlanner";\nimport { ProposalDocumentExporter } from "@/components/ProposalDocumentExporter";',
  );
  const exporterSection = `
        <ProposalDocumentExporter
          clientName={clientName || "Client"}
          grantTitle={grant?.title || "Grant Proposal"}
          funderName="Funder Program"
          sections={Array.isArray(sections) ? sections.map((s: any) => ({ heading: s.heading || "Section", content: s.content })) : []}
        />
  `;
  proposalContent = proposalContent.replace(
    "<GrantBudgetPlanner grantMaxAmount={100000} />",
    `<GrantBudgetPlanner grantMaxAmount={100000} />\n${exporterSection}`,
  );
  fs.writeFileSync(proposalPath, proposalContent, "utf-8");
  console.log("Updated proposal editor with ProposalDocumentExporter!");
}

console.log("Integrations completed!");
