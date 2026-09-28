import fs from "node:fs";
import path from "node:path";

const GRANTDESK_SRC = "e:/dev/grantdesk/src";

// 1. Update __root.tsx to include AskGrantDeskChat
const rootPath = path.join(GRANTDESK_SRC, "routes/__root.tsx");
let rootContent = fs.readFileSync(rootPath, "utf-8");
if (!rootContent.includes("AskGrantDeskChat")) {
  rootContent = rootContent.replace(
    'import { Nav } from "@/components/Nav";',
    'import { Nav } from "@/components/Nav";\nimport { AskGrantDeskChat } from "@/components/AskGrantDeskChat";'
  );
  rootContent = rootContent.replace(
    "<Nav />",
    "<Nav />\n      <AskGrantDeskChat />"
  );
  fs.writeFileSync(rootPath, rootContent, "utf-8");
  console.log("Updated __root.tsx with AskGrantDeskChat!");
}

// 2. Update clients_.$clientId.matches.tsx to include ExplainableFitScorecard
const matchesPath = path.join(GRANTDESK_SRC, "routes/clients_.$clientId.matches.tsx");
let matchesContent = fs.readFileSync(matchesPath, "utf-8");
if (!matchesContent.includes("ExplainableFitScorecard")) {
  matchesContent = matchesContent.replace(
    'import { findMatches } from "@/server/match.functions";',
    'import { findMatches } from "@/server/match.functions";\nimport { ExplainableFitScorecard } from "@/components/ExplainableFitScorecard";'
  );
  matchesContent = matchesContent.replace(
    '{axes.length > 0 && (',
    '<div className="mt-3"><ExplainableFitScorecard relevance={row.relevance} verdict={row.verdict} axes={axes} /></div>\n        {axes.length > 0 && ('
  );
  fs.writeFileSync(matchesPath, matchesContent, "utf-8");
  console.log("Updated clients_.$clientId.matches.tsx with ExplainableFitScorecard!");
}

// 3. Update clients.$clientId.tsx to include ProposalPipelineBoard & GrantBudgetPlanner
const clientDetailPath = path.join(GRANTDESK_SRC, "routes/clients.$clientId.tsx");
let clientDetailContent = fs.readFileSync(clientDetailPath, "utf-8");
if (!clientDetailContent.includes("ProposalPipelineBoard")) {
  clientDetailContent = clientDetailContent.replace(
    'import { assessProfile, nextGap, type ProfileFields } from "@/lib/profile-completeness";',
    'import { assessProfile, nextGap, type ProfileFields } from "@/lib/profile-completeness";\nimport { ProposalPipelineBoard, type ProposalItem } from "@/components/ProposalPipelineBoard";\nimport { GrantBudgetPlanner } from "@/components/GrantBudgetPlanner";'
  );
  // Add sample proposals pipeline state
  const pipelineSection = `
      {/* Lovable-Inspired Proposal Pipeline & Budget Tracker */}
      <section className="mt-8 space-y-6" data-testid="proposal-pipeline-section">
        <h2 className="text-lg font-bold text-[var(--color-ink)]">Proposal Funnel & Budgeting</h2>
        <ProposalPipelineBoard
          proposals={[
            {
              id: "p1",
              grantId: "g1",
              grantTitle: "Clean Technology Innovation Program",
              funderName: "Innovation Canada",
              amountMax: 150000,
              currency: "CAD",
              deadline: "2026-11-30",
              relevance: 0.92,
              stage: "draft",
            },
            {
              id: "p2",
              grantId: "g2",
              grantTitle: "Community Green Infrastructure Grant",
              funderName: "Ontario Trillium Foundation",
              amountMax: 75000,
              currency: "CAD",
              deadline: "2026-10-15",
              relevance: 0.88,
              stage: "in_review",
            },
            {
              id: "p3",
              grantId: "g3",
              grantTitle: "Subsidies for Youth Employment",
              funderName: "ESDC Canada",
              amountMax: 35000,
              currency: "CAD",
              deadline: "2026-12-01",
              relevance: 0.75,
              stage: "submitted",
            },
          ]}
        />
        <GrantBudgetPlanner grantMaxAmount={150000} />
      </section>
  `;
  clientDetailContent = clientDetailContent.replace(
    '</main>',
    `${pipelineSection}\n    </main>`
  );
  fs.writeFileSync(clientDetailPath, clientDetailContent, "utf-8");
  console.log("Updated clients.$clientId.tsx with ProposalPipelineBoard & GrantBudgetPlanner!");
}

// 4. Update proposal editor clients_.$clientId.proposals.$grantId.tsx to include ProposalApprovalWorkflow & GrantBudgetPlanner
const proposalEditorPath = path.join(GRANTDESK_SRC, "routes/clients_.$clientId.proposals.$grantId.tsx");
let proposalEditorContent = fs.readFileSync(proposalEditorPath, "utf-8");
if (!proposalEditorContent.includes("ProposalApprovalWorkflow")) {
  proposalEditorContent = proposalEditorContent.replace(
    'import { createFileRoute, Link } from "@tanstack/react-router";',
    'import { createFileRoute, Link } from "@tanstack/react-router";\nimport { ProposalApprovalWorkflow } from "@/components/ProposalApprovalWorkflow";\nimport { GrantBudgetPlanner } from "@/components/GrantBudgetPlanner";'
  );

  const workflowSection = `
      {/* SmartRoute Workflow & Budget Planner */}
      <div className="mt-6 space-y-6">
        <ProposalApprovalWorkflow
          currentStage="draft"
          wordCount={sections.reduce((sum, s) => sum + (s.word_count || 0), 0)}
          wordLimit={5000}
          unacknowledgedCount={0}
          onStageChange={(newStage) => console.log("Stage changed to:", newStage)}
        />
        <GrantBudgetPlanner grantMaxAmount={grant?.amount_max || 100000} />
      </div>
  `;

  proposalEditorContent = proposalEditorContent.replace(
    '</main>',
    `${workflowSection}\n    </main>`
  );
  fs.writeFileSync(proposalEditorPath, proposalEditorContent, "utf-8");
  console.log("Updated proposal editor with ProposalApprovalWorkflow & GrantBudgetPlanner!");
}

console.log("All component integrations completed!");
