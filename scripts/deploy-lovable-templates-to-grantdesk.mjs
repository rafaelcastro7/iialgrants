import fs from "node:fs";
import path from "node:path";

const GRANTDESK_DIR = "e:/dev/grantdesk/src/components";

if (!fs.existsSync(GRANTDESK_DIR)) {
  fs.mkdirSync(GRANTDESK_DIR, { recursive: true });
}

// 1. ProposalPipelineBoard.tsx (Dealflow template)
const pipelineBoardContent = `import { useState } from "react";

export type ProposalStage = "discovered" | "draft" | "in_review" | "approved" | "submitted" | "awarded" | "declined";

export type ProposalItem = {
  id: string;
  grantId: string;
  grantTitle: string;
  funderName: string;
  amountMax: number | null;
  currency: string | null;
  deadline: string | null;
  relevance: number | null;
  stage: ProposalStage;
};

const STAGES: Array<{ key: ProposalStage; label: string; color: string }> = [
  { key: "discovered", label: "Discovered", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { key: "draft", label: "Drafting", color: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { key: "in_review", label: "In Review", color: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  { key: "approved", label: "Approved", color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  { key: "submitted", label: "Submitted", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { key: "awarded", label: "Awarded", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { key: "declined", label: "Declined", color: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
];

type Props = {
  proposals: ProposalItem[];
  onStageChange?: (proposalId: string, newStage: ProposalStage) => void;
};

export function ProposalPipelineBoard({ proposals: initialProposals, onStageChange }: Props) {
  const [items, setItems] = useState<ProposalItem[]>(initialProposals);

  const handleStageMove = (id: string, newStage: ProposalStage) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, stage: newStage } : item))
    );
    if (onStageChange) {
      onStageChange(id, newStage);
    }
  };

  const totalValue = items.reduce((sum, item) => sum + (item.amountMax || 0), 0);
  const weightedValue = items.reduce(
    (sum, item) => sum + (item.amountMax || 0) * (item.relevance || 0.5),
    0
  );

  return (
    <div className="space-y-4 my-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 text-white shadow-sm">
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pipeline Forecasting</h3>
          <p className="text-xl font-bold mt-0.5">
            \${totalValue.toLocaleString("en-US")} CAD <span className="text-xs text-slate-400 font-normal">(Total Cap)</span>
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Weighted Expected Value (\$ Expected)</span>
          <p className="text-xl font-bold text-emerald-300 mt-0.5">
            \${Math.round(weightedValue).toLocaleString("en-US")} CAD
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const stageItems = items.filter((item) => item.stage === stage.key);
          const stageTotal = stageItems.reduce((sum, item) => sum + (item.amountMax || 0), 0);

          return (
            <div
              key={stage.key}
              className="flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-2.5 min-w-[200px]"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 mb-2">
                <span className={\`px-2 py-0.5 text-xs font-semibold rounded-full \${stage.color}\`}>
                  {stage.label}
                </span>
                <span className="text-xs font-bold text-slate-500">{stageItems.length}</span>
              </div>

              <div className="text-[11px] text-slate-500 font-medium px-1 mb-2">
                \${stageTotal.toLocaleString("en-US")}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto max-h-[400px]">
                {stageItems.length === 0 ? (
                  <div className="text-xs text-slate-400 italic text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded">
                    No proposals
                  </div>
                ) : (
                  stageItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xs space-y-2 hover:border-slate-400 transition-colors"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                        {item.grantTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.funderName}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-medium pt-1 border-t border-slate-100 dark:border-slate-700">
                        <span className="text-slate-700 dark:text-slate-300">
                          {item.amountMax ? \`\$\${item.amountMax.toLocaleString()}\` : "N/A"}
                        </span>
                        {item.relevance !== null && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                            {Math.round(item.relevance * 100)}% fit
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 pt-1 justify-end">
                        {stage.key !== "discovered" && (
                          <button
                            type="button"
                            onClick={() => {
                              const idx = STAGES.findIndex((s) => s.key === stage.key);
                              if (idx > 0) handleStageMove(item.id, STAGES[idx - 1].key);
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 cursor-pointer"
                            title="Move back"
                          >
                            ←
                          </button>
                        )}
                        {stage.key !== "declined" && stage.key !== "awarded" && (
                          <button
                            type="button"
                            onClick={() => {
                              const idx = STAGES.findIndex((s) => s.key === stage.key);
                              if (idx < STAGES.length - 1) handleStageMove(item.id, STAGES[idx + 1].key);
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-300 cursor-pointer"
                            title="Move forward"
                          >
                            →
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
`;

// 2. ExplainableFitScorecard.tsx (Account/Customer Health template)
const scorecardContent = `import type { Axis } from "@/lib/axis-breakdown";

type Props = {
  relevance: number | null;
  verdict: "eligible" | "needs_input" | "ineligible";
  axes: Axis[];
};

export function ExplainableFitScorecard({ relevance, verdict, axes }: Props) {
  const verdictBadges = {
    eligible: { label: "Can Apply", color: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800" },
    needs_input: { label: "Needs Input", color: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800" },
    ineligible: { label: "Ruled Out", color: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800" },
  };

  const statusIcons = {
    pass: "✓ Pass",
    partial: "⚠ Partial",
    fail: "✕ Fail",
    unknown: "? Unknown",
  };

  const statusStyles = {
    pass: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    partial: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    fail: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    unknown: "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Explainable Fit Scorecard</h4>
          <p className="text-xs text-slate-500">Multidimensional eligibility & health breakdown</p>
        </div>
        <div className="flex items-center gap-3">
          {relevance !== null && (
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Relevance</span>
              <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                {Math.round(relevance * 100)}%
              </span>
            </div>
          )}
          <span className={\`px-2.5 py-1 text-xs font-bold border rounded-full \${verdictBadges[verdict].color}\`}>
            {verdictBadges[verdict].label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {axes.map((axis) => (
          <div
            key={axis.key}
            className={\`p-3 rounded-lg border text-xs space-y-2 \${statusStyles[axis.status]}\`}
          >
            <div className="flex items-center justify-between font-semibold">
              <span>{axis.label}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-white/50 dark:bg-slate-900/50">
                {statusIcons[axis.status]}
              </span>
            </div>

            {axis.decisive && (
              <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                ▲ Decisive Gate
              </div>
            )}

            <ul className="space-y-1 text-[11px] list-disc list-inside opacity-90">
              {axis.reasons.map((reason, idx) => (
                <li key={idx} className="line-clamp-2">{reason}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
`;

// 3. ProposalApprovalWorkflow.tsx (SmartRoute template)
const workflowContent = `import { useState } from "react";

type Stage = "draft" | "in_review" | "approved" | "submitted";

type Props = {
  currentStage: Stage;
  wordCount: number;
  wordLimit?: number | null;
  unacknowledgedCount: number;
  onStageChange: (newStage: Stage) => void;
};

export function ProposalApprovalWorkflow({
  currentStage: initialStage,
  wordCount,
  wordLimit,
  unacknowledgedCount,
  onStageChange,
}: Props) {
  const [stage, setStage] = useState<Stage>(initialStage);

  const stages: Array<{ key: Stage; label: string; number: number }> = [
    { key: "draft", label: "Drafting", number: 1 },
    { key: "in_review", label: "In Review", number: 2 },
    { key: "approved", label: "Approved", number: 3 },
    { key: "submitted", label: "Submitted", number: 4 },
  ];

  const currentIdx = stages.findIndex((s) => s.key === stage);

  const handleAdvance = (next: Stage) => {
    setStage(next);
    onStageChange(next);
  };

  const wordCountValid = !wordLimit || wordCount <= wordLimit;
  const isReadyForApproval = wordCountValid && unacknowledgedCount === 0;

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">SmartRoute Approval & Quality Gate</h4>
          <p className="text-xs text-slate-500">Multi-stage sign-off and compliance checks</p>
        </div>
        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800 uppercase tracking-wider">
          Stage: {stage.replace("_", " ")}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="grid grid-cols-4 gap-2">
        {stages.map((s, idx) => {
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;

          return (
            <div
              key={s.key}
              className={\`p-2 rounded-lg text-center border text-xs transition-colors \${
                isActive
                  ? "bg-indigo-600 text-white font-bold border-indigo-600"
                  : isDone
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800"
                    : "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
              }\`}
            >
              <div className="text-[10px] uppercase font-semibold opacity-80">Step {s.number}</div>
              <div>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Quality Gate Checklist */}
      <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 space-y-2 text-xs">
        <h5 className="font-semibold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider">
          Quality Gate Check
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <span className={wordCountValid ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
              {wordCountValid ? "✓" : "✕"}
            </span>
            <span>
              Word Count: {wordCount} {wordLimit ? \`/ \${wordLimit}\` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={unacknowledgedCount === 0 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
              {unacknowledgedCount === 0 ? "✓" : "⚠"}
            </span>
            <span>
              Requirements: {unacknowledgedCount === 0 ? "All acknowledged" : \`\${unacknowledgedCount} pending\` }
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        {stage === "draft" && (
          <button
            type="button"
            onClick={() => handleAdvance("in_review")}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
          >
            Submit for Review →
          </button>
        )}
        {stage === "in_review" && (
          <button
            type="button"
            disabled={!isReadyForApproval}
            onClick={() => handleAdvance("approved")}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            Approve Proposal ✓
          </button>
        )}
        {stage === "approved" && (
          <button
            type="button"
            onClick={() => handleAdvance("submitted")}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
          >
            Mark Submitted 🚀
          </button>
        )}
      </div>
    </div>
  );
}
`;

// 4. GrantBudgetPlanner.tsx (Budget Pulse template)
const budgetContent = `import { useState } from "react";

export type BudgetItem = {
  id: string;
  category: "Personnel" | "Equipment" | "Travel" | "Subcontracts" | "Indirect";
  description: string;
  plannedAmount: number;
  actualAmount?: number;
};

type Props = {
  grantMaxAmount?: number | null;
  items?: BudgetItem[];
  onSave?: (items: BudgetItem[]) => void;
};

const DEFAULT_ITEMS: BudgetItem[] = [
  { id: "1", category: "Personnel", description: "Lead Researcher & Project Coordinator", plannedAmount: 45000, actualAmount: 42000 },
  { id: "2", category: "Equipment", description: "Lab & Testing Hardware", plannedAmount: 15000, actualAmount: 15500 },
  { id: "3", category: "Travel", description: "Field Site Visits & Conference Dissemination", plannedAmount: 5000, actualAmount: 4800 },
  { id: "4", category: "Indirect", description: "Institutional Administrative Overhead (10%)", plannedAmount: 6500, actualAmount: 6500 },
];

export function GrantBudgetPlanner({ grantMaxAmount, items: initialItems = DEFAULT_ITEMS, onSave }: Props) {
  const [items, setItems] = useState<BudgetItem[]>(initialItems);
  const [category, setCategory] = useState<BudgetItem["category"]>("Personnel");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const addItem = () => {
    if (!description.trim() || !amount) return;
    const newItem: BudgetItem = {
      id: Math.random().toString(),
      category,
      description: description.trim(),
      plannedAmount: parseFloat(amount) || 0,
      actualAmount: 0,
    };
    const updated = [...items, newItem];
    setItems(updated);
    setDescription("");
    setAmount("");
    if (onSave) onSave(updated);
  };

  const totalPlanned = items.reduce((sum, i) => sum + i.plannedAmount, 0);
  const totalActual = items.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
  const variance = totalPlanned - totalActual;

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Budget Pulse & Post-Award Variance Tracker</h4>
          <p className="text-xs text-slate-500">Category breakdown and budget vs. actual spending</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Total Planned</span>
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">
            \${totalPlanned.toLocaleString("en-US")} CAD
          </span>
        </div>
      </div>

      {grantMaxAmount && (
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs flex items-center justify-between border border-slate-200 dark:border-slate-700">
          <span>Grant Maximum Cap: <strong>\${grantMaxAmount.toLocaleString("en-US")} CAD</strong></span>
          <span className={totalPlanned <= grantMaxAmount ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
            {totalPlanned <= grantMaxAmount ? "✓ Within Cap" : "⚠ Exceeds Cap"}
          </span>
        </div>
      )}

      {/* Add Item Form */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as BudgetItem["category"])}
          className="p-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="Personnel">Personnel</option>
          <option value="Equipment">Equipment</option>
          <option value="Travel">Travel</option>
          <option value="Subcontracts">Subcontracts</option>
          <option value="Indirect">Indirect</option>
        </select>
        <input
          type="text"
          placeholder="Item Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="p-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sm:col-span-2"
        />
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Planned \$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="p-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-full"
          />
          <button
            type="button"
            onClick={addItem}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 cursor-pointer"
          >
            Add
          </button>
        </div>
      </div>

      {/* Budget Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
              <th className="py-2">Category</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Planned \$</th>
              <th className="py-2 text-right">Actual \$</th>
              <th className="py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => {
              const itemVar = item.plannedAmount - (item.actualAmount || 0);
              return (
                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="py-2 font-semibold text-slate-700 dark:text-slate-300">{item.category}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-400">{item.description}</td>
                  <td className="py-2 text-right font-medium">\${item.plannedAmount.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">\${(item.actualAmount || 0).toLocaleString()}</td>
                  <td className={\`py-2 text-right font-bold \${itemVar >= 0 ? "text-emerald-600" : "text-rose-600"}\`}>
                    \${itemVar.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;

// 5. AskGrantDeskChat.tsx (Lovable Insights template)
const chatContent = `import { useState } from "react";

export function AskGrantDeskChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    { sender: "ai", text: "Hello! I am your GrantDesk Intelligence Assistant. Ask me anything about Canadian/US funding programs, client eligibility, or draft criteria." },
  ]);

  const handleSend = () => {
    if (!query.trim()) return;
    const userMsg = query.trim();
    setMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setQuery("");

    setTimeout(() => {
      let reply = "I analyzed our catalog and past awards. ";
      if (userMsg.toLowerCase().includes("ontario") || userMsg.toLowerCase().includes("clean")) {
        reply += "Found 3 matching opportunities in Ontario for clean technology: 1. Sustainable Development Technology Canada (SDTC) Seed Fund, 2. Ontario Centre of Innovation (OCI) Voucher Program, 3. ECCC Clean Growth Grant.";
      } else {
        reply += "Based on client profiles, 4 open calls match your eligibility requirements with 85%+ confidence.";
      }
      setMessages((prev) => [...prev, { sender: "ai", text: reply }]);
    }, 600);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 p-3 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-transform active:scale-95 text-xs font-bold flex items-center gap-2 cursor-pointer z-50"
      >
        <span>💬 Ask GrantDesk</span>
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
          onClick={handleSend}
          className="px-3 py-1.5 text-xs font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
        >
          Send
        </button>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(
  path.join(GRANTDESK_DIR, "ProposalPipelineBoard.tsx"),
  pipelineBoardContent,
  "utf-8",
);
fs.writeFileSync(
  path.join(GRANTDESK_DIR, "ExplainableFitScorecard.tsx"),
  scorecardContent,
  "utf-8",
);
fs.writeFileSync(
  path.join(GRANTDESK_DIR, "ProposalApprovalWorkflow.tsx"),
  workflowContent,
  "utf-8",
);
fs.writeFileSync(path.join(GRANTDESK_DIR, "GrantBudgetPlanner.tsx"), budgetContent, "utf-8");
fs.writeFileSync(path.join(GRANTDESK_DIR, "AskGrantDeskChat.tsx"), chatContent, "utf-8");

console.log("Successfully written 5 Lovable-inspired components to GrantDesk!");
