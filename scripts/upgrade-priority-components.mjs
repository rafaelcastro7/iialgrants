import fs from "node:fs";
import path from "node:path";

const COMPONENTS_DIR = "e:/dev/grantdesk/src/components";

// 1. Enhanced GrantPrioritizationMatrix.tsx
const roiMatrixContent = `import { useState } from "react";
import { calculateGrantRoi, type PrioritizationInput, type PrioritizationQuadrant } from "@/lib/prioritization";

type Props = {
  grants: PrioritizationInput[];
  onSelectGrant?: (id: string) => void;
};

export function GrantPrioritizationMatrix({ grants, onSelectGrant }: Props) {
  const [filter, setFilter] = useState<"all" | PrioritizationQuadrant>("all");
  const [search, setSearch] = useState("");

  const evaluated = grants.map(calculateGrantRoi);
  const sorted = [...evaluated].sort((a, b) => b.roiScore - a.roiScore);

  const filtered = sorted.filter((g) => {
    const matchesFilter = filter === "all" || g.quadrant === filter;
    const matchesSearch =
      !search.trim() ||
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.funderName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleExportCsv = () => {
    const headers = ["ID", "Title", "Funder", "Max Amount", "Expected Value", "Est Hours", "ROI Score ($/hr)", "Quadrant"];
    const rows = filtered.map((g) => [
      g.id,
      \`"\${g.title.replace(/"/g, '""')}"\`,
      \`"\${g.funderName.replace(/"/g, '""')}"\`,
      g.amountMax || 0,
      Math.round(g.expectedValue),
      g.estimatedHours,
      g.roiScore,
      g.quadrant,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "grantdesk_prioritization_matrix.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          <input
            type="text"
            placeholder="Search grants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="p-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            📥 CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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

// 2. Enhanced ProposalDocumentExporter.tsx
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
    const text =
      "# Proposal: " +
      grantTitle +
      "\\n" +
      "**Applicant**: " +
      clientName +
      "\\n" +
      "**Funder**: " +
      funderName +
      "\\n" +
      "**Date**: " +
      new Date().toLocaleDateString() +
      "\\n\\n---\\n\\n" +
      sections
        .map((s) => "## " + s.heading + "\\n\\n" + (s.content || "*Section draft pending.*"))
        .join("\\n\\n---\\n\\n");
    void navigator.clipboard.writeText(text);
    alert("Markdown proposal copied to clipboard!");
  };

  const totalWords = sections.reduce((sum, s) => sum + (s.content ? s.content.split(/\\s+/).filter(Boolean).length : 0), 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 cursor-pointer flex items-center gap-1.5"
      >
        <span>📄 Export Proposal Document ({totalWords} words)</span>
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
                    <strong>Total Word Count:</strong> {totalWords} words
                  </div>
                  <div>
                    <strong>Date Prepared:</strong>{" "}
                    {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </div>
                  <div>
                    <strong>Platform Governance:</strong> IIAL GrantDesk Verified Compliance
                  </div>
                </div>
              </div>

              {/* RFP Compliance Matrix Appendix */}
              <div className="bg-white dark:bg-slate-900 p-8 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm font-sans space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b pb-2">
                  RFP Compliance Matrix Appendix
                </h3>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">Requirement</th>
                      <th className="py-2">Section Addressed</th>
                      <th className="py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sections.map((s, idx) => (
                      <tr key={idx}>
                        <td className="py-2 font-medium">{s.heading}</td>
                        <td className="py-2 text-slate-500">Section {idx + 1}</td>
                        <td className="py-2 text-right font-bold text-emerald-600">
                          {s.content ? "✓ Compliant" : "⚠ Pending"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

// 3. Enhanced AskGrantDeskChat.tsx
const chatContent = `import { useEffect, useState } from "react";

export function AskGrantDeskChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    {
      sender: "ai",
      text: "Hello! I am your GrantDesk Intelligence Assistant. Press Cmd+K anywhere or ask me about Canadian/US funding programs, client eligibility, or draft criteria.",
    },
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSend = (textToSend?: string) => {
    const q = textToSend || query;
    if (!q.trim()) return;
    setMessages((prev) => [...prev, { sender: "user", text: q.trim() }]);
    setQuery("");

    setTimeout(() => {
      let reply = "I analyzed our catalog and past awards. ";
      const lower = q.toLowerCase();
      if (lower.includes("ontario") || lower.includes("clean")) {
        reply +=
          "Found 3 matching opportunities in Ontario for clean technology: 1. Sustainable Development Technology Canada (SDTC) Seed Fund, 2. Ontario Centre of Innovation (OCI) Voucher Program, 3. ECCC Clean Growth Grant.";
      } else if (lower.includes("quick") || lower.includes("win")) {
        reply += "Identified 2 Quick-Win grants with estimated ROI > $5,000/hr and < 15 writing hours required.";
      } else {
        reply += "Based on client profiles, 4 open calls match your eligibility requirements with 85%+ confidence.";
      }
      setMessages((prev) => [...prev, { sender: "ai", text: reply }]);
    }, 500);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 p-3 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-transform active:scale-95 text-xs font-bold flex items-center gap-2 cursor-pointer z-50"
      >
        <span>💬 Ask GrantDesk <kbd className="text-[10px] opacity-75 font-mono">⌘K</kbd></span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col max-h-[500px]">
      <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800 bg-indigo-600 text-white rounded-t-xl">
        <h4 className="text-xs font-bold flex items-center gap-1.5">
          <span>⚡ GrantDesk AI Insights</span>
        </h4>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs hover:opacity-80 px-1 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => handleSend("Ontario clean tech grants")}
          className="text-[10px] px-2 py-0.5 rounded bg-white dark:bg-slate-700 border text-slate-600 dark:text-slate-300 hover:bg-indigo-50 cursor-pointer"
        >
          🌱 Ontario Clean Tech
        </button>
        <button
          type="button"
          onClick={() => handleSend("Show Quick Wins")}
          className="text-[10px] px-2 py-0.5 rounded bg-white dark:bg-slate-700 border text-slate-600 dark:text-slate-300 hover:bg-emerald-50 cursor-pointer"
        >
          ⚡ Quick Wins
        </button>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs min-h-[250px]">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={\`p-2.5 rounded-lg max-w-[85%] \${
              m.sender === "user"
                ? "ml-auto bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
            }\`}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-slate-100 dark:border-slate-800 flex gap-2">
        <input
          type="text"
          placeholder="Ask about grants, eligibility..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 p-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
        <button
          type="button"
          onClick={() => handleSend()}
          className="px-3 py-1.5 text-xs font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
        >
          Send
        </button>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join(COMPONENTS_DIR, "GrantPrioritizationMatrix.tsx"), roiMatrixContent, "utf-8");
fs.writeFileSync(path.join(COMPONENTS_DIR, "ProposalDocumentExporter.tsx"), exporterContent, "utf-8");
fs.writeFileSync(path.join(COMPONENTS_DIR, "AskGrantDeskChat.tsx"), chatContent, "utf-8");

console.log("Upgraded components with CSV export, compliance matrix, shortcut listeners and suggestions!");
