import fs from "node:fs";
import path from "node:path";

const GRANTDESK_SRC = "e:/dev/grantdesk/src";
const COMPONENTS_DIR = path.join(GRANTDESK_SRC, "components");
const ROUTES_DIR = path.join(GRANTDESK_SRC, "routes");

if (!fs.existsSync(COMPONENTS_DIR)) {
  fs.mkdirSync(COMPONENTS_DIR, { recursive: true });
}

// 1. GrantPrioritizationMatrix.tsx (#2 - ROI Matrix)
const roiMatrixContent = `import { useState } from "react";

export type PrioritizedGrant = {
  id: string;
  title: string;
  funderName: string;
  amountMax: number | null;
  relevance: number | null;
  requirementCount: number;
  deadline: string | null;
};

type Props = {
  grants: PrioritizedGrant[];
  onSelectGrant?: (id: string) => void;
};

export function GrantPrioritizationMatrix({ grants, onSelectGrant }: Props) {
  const [filter, setFilter] = useState<"all" | "quick_wins" | "high_value" | "low_priority">("all");

  const evaluated = grants.map((g) => {
    const amount = g.amountMax || 50000;
    const rel = g.relevance || 0.5;
    const expectedValue = amount * rel;
    const estimatedHours = Math.max(8, g.requirementCount * 6);
    const roiScore = Math.round(expectedValue / estimatedHours);

    let quadrant: "quick_wins" | "high_value" | "filler" | "low_priority" = "filler";
    if (roiScore > 2000 && estimatedHours <= 20) quadrant = "quick_wins";
    else if (roiScore > 2000 && estimatedHours > 20) quadrant = "high_value";
    else if (roiScore <= 2000 && estimatedHours > 20) quadrant = "low_priority";

    return { ...g, expectedValue, estimatedHours, roiScore, quadrant };
  });

  const sorted = [...evaluated].sort((a, b) => b.roiScore - a.roiScore);
  const filtered = filter === "all" ? sorted : sorted.filter((g) => g.quadrant === filter);

  const quickWinsCount = evaluated.filter((g) => g.quadrant === "quick_wins").length;
  const highValueCount = evaluated.filter((g) => g.quadrant === "high_value").length;

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Grant Prioritization Matrix (ROI & Effort)
          </h4>
          <p className="text-xs text-slate-500">
            Rank calls by Expected Return vs. Writing Effort (Hours required)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={\`px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer \${
              filter === "all"
                ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
            }\`}
          >
            All ({grants.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("quick_wins")}
            className={\`px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer \${
              filter === "quick_wins"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
            }\`}
          >
            ⚡ Quick Wins ({quickWinsCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("high_value")}
            className={\`px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer \${
              filter === "high_value"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
            }\`}
          >
            🎯 High Value ({highValueCount})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
              <th className="py-2">Grant Opportunity</th>
              <th className="py-2">Funder</th>
              <th className="py-2 text-right">Max Cap</th>
              <th className="py-2 text-right">Est. Effort</th>
              <th className="py-2 text-right">Expected ROI</th>
              <th className="py-2 text-center">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((g) => (
              <tr
                key={g.id}
                onClick={() => onSelectGrant && onSelectGrant(g.id)}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
              >
                <td className="py-2.5 font-semibold text-slate-900 dark:text-slate-100 max-w-[240px] truncate">
                  {g.title}
                </td>
                <td className="py-2.5 text-slate-500 max-w-[150px] truncate">{g.funderName}</td>
                <td className="py-2.5 text-right font-medium text-slate-700 dark:text-slate-300">
                  {g.amountMax ? \`\$\${g.amountMax.toLocaleString()}\` : "N/A"}
                </td>
                <td className="py-2.5 text-right text-slate-500 font-mono">
                  ~{g.estimatedHours} hrs
                </td>
                <td className="py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  \${g.roiScore.toLocaleString()}/hr
                </td>
                <td className="py-2.5 text-center">
                  <span
                    className={\`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider \${
                      g.quadrant === "quick_wins"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : g.quadrant === "high_value"
                          ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }\`}
                  >
                    {g.quadrant.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;

// 2. ProposalDocumentExporter.tsx (#4 - Proposal Exporter)
const exporterContent = `import { useState } from "react";

type Section = {
  heading: string;
  content: string | null;
  wordCount?: number | null;
};

type Props = {
  clientName: string;
  grantTitle: string;
  funderName: string;
  sections: Section[];
};

export function ProposalDocumentExporter({ clientName, grantTitle, funderName, sections }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyMarkdown = () => {
    const text = `# Proposal: ${grantTitle}
**Applicant**: ${clientName}
**Funder**: ${funderName}
**Date**: ${new Date().toLocaleDateString()}

---

${sections.map((s) => `## ${s.heading}\n\n${s.content || "*Section draft pending.*"}`).join("\n\n---\n\n")}
`;
    navigator.clipboard.writeText(text);
    alert("Markdown proposal copied to clipboard!");
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 cursor-pointer flex items-center gap-1.5"
      >
        <span>📄 Export Proposal Document</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Pro-Format Proposal Document Export
                </h3>
                <p className="text-xs text-slate-500">
                  Formal document view with cover page and compliance structure
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="px-3 py-1 text-xs font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Copy Markdown
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3 py-1 text-xs font-semibold rounded bg-indigo-600 text-white cursor-pointer"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Print Document Layout */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100 dark:bg-slate-950 font-serif text-slate-900 dark:text-slate-100 space-y-8">
              {/* Cover Page */}
              <div className="bg-white dark:bg-slate-900 p-10 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm min-h-[400px] flex flex-col justify-between">
                <div>
                  <span className="text-xs font-sans uppercase font-bold tracking-widest text-indigo-600 dark:text-indigo-400">
                    Grant Proposal Application
                  </span>
                  <h1 className="text-2xl font-bold font-sans mt-3 text-slate-900 dark:text-slate-100">
                    {grantTitle}
                  </h1>
                  <p className="text-sm font-sans text-slate-500 mt-1">Submitted to: {funderName}</p>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-6 font-sans text-xs space-y-1">
                  <div>
                    <strong>Applicant Organization:</strong> {clientName}
                  </div>
                  <div>
                    <strong>Date Prepared:</strong> {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </div>
                  <div>
                    <strong>Platform Governance:</strong> IIAL GrantDesk Verified
                  </div>
                </div>
              </div>

              {/* Sections */}
              <div className="bg-white dark:bg-slate-900 p-10 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm space-y-8">
                <h2 className="text-lg font-bold font-sans border-b border-slate-200 pb-2">
                  Table of Contents & Proposal Sections
                </h2>
                {sections.map((sec, idx) => (
                  <div key={idx} className="space-y-3">
                    <h3 className="text-base font-bold font-sans text-indigo-950 dark:text-indigo-300">
                      {idx + 1}. {sec.heading}
                    </h3>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200 font-sans">
                      {sec.content || <em className="text-slate-400">Draft content pending completion.</em>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

// 3. DesignSystemShowcase.tsx (#5 - Design System)
const showcaseContent = `export function DesignSystemShowcase() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 my-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          GrantDesk Design System & Tokens
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Standardized UI primitives, eligibility color tokens, and accessibility guidelines
        </p>
      </div>

      {/* Color Tokens */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          1. Verdict & Status Color Tokens
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800 space-y-1">
            <div className="font-bold text-sm">✓ Eligible / Can Apply</div>
            <div className="text-xs font-mono">--color-eligible (#059669)</div>
          </div>
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800 space-y-1">
            <div className="font-bold text-sm">⚠ Needs Input</div>
            <div className="text-xs font-mono">--color-needs-input (#d97706)</div>
          </div>
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800 space-y-1">
            <div className="font-bold text-sm">✕ Ineligible / Ruled Out</div>
            <div className="text-xs font-mono">--color-ineligible (#dc2626)</div>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          2. Badges & Labels
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Default Badge
          </span>
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Quick Win
          </span>
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
            High Value
          </span>
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200">
            Tenant: IIAL
          </span>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          3. Button Hierarchy
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="px-4 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Primary Action
          </button>
          <button
            type="button"
            className="px-4 py-2 text-xs font-semibold rounded-md bg-indigo-600 text-white"
          >
            Accent Action
          </button>
          <button
            type="button"
            className="px-4 py-2 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800"
          >
            Secondary Action
          </button>
        </div>
      </section>
    </div>
  );
}
`;

fs.writeFileSync(path.join(COMPONENTS_DIR, "GrantPrioritizationMatrix.tsx"), roiMatrixContent, "utf-8");
fs.writeFileSync(path.join(COMPONENTS_DIR, "ProposalDocumentExporter.tsx"), exporterContent, "utf-8");
fs.writeFileSync(path.join(COMPONENTS_DIR, "DesignSystemShowcase.tsx"), showcaseContent, "utf-8");

// Create design-system route e:/dev/grantdesk/src/routes/design-system.tsx
const routeContent = `import { createFileRoute } from "@tanstack/react-router";
import { DesignSystemShowcase } from "@/components/DesignSystemShowcase";

export const Route = createFileRoute("/design-system")({
  component: DesignSystemShowcase,
});
`;
fs.writeFileSync(path.join(ROUTES_DIR, "design-system.tsx"), routeContent, "utf-8");

console.log("Written GrantPrioritizationMatrix, ProposalDocumentExporter, and DesignSystemShowcase!");
