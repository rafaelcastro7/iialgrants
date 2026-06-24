// NotebookLM briefing — one-click flow.
//
// Picks a scope, generates an evidence-rich Markdown briefing on the server,
// then offers three terminal actions in the same modal:
//   • Copy to clipboard  (paste straight into NotebookLM "Paste text")
//   • Download .md       (upload as a source if the user prefers files)
//   • Open NotebookLM    (deep link to notebooklm.google.com in a new tab)
//
// Optionally auto-marks the included grants as Shortlisted, eliminating the
// previous "paste UUIDs back" step.

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BookOpenText, Copy, Download, ExternalLink, Sparkles,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildNotebookBriefing } from "@/lib/notebooklm.functions";

type Scope = "single" | "top-fit" | "shortlisted" | "all-enriched";

const MULTI_SCOPES: { id: Exclude<Scope, "single">; title: string; subtitle: string }[] = [
  { id: "top-fit", title: "Top 25 by fit", subtitle: "Highest-scoring grants the Evaluator has ranked. Best default." },
  { id: "shortlisted", title: "My shortlist", subtitle: "Only grants already moved to Shortlisted. Curated set." },
  { id: "all-enriched", title: "Everything enriched", subtitle: "All grants with verified evidence. Broadest scan." },
];

type Result = {
  ok: true;
  generatedAt: string; scope: string; count: number;
  grantsWithEvidence: number; totalSpans: number;
  shortlistedCount: number; markdown: string; ids: string[];
} | { ok: false; reason: string; message: string };

export function NotebookLMBridge({
  grantId,
  label,
  variant = "outline",
}: {
  grantId?: string;
  label?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
} = {}) {
  const build = useServerFn(buildNotebookBriefing);
  const qc = useQueryClient();

  const isSingle = !!grantId;
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>(isSingle ? "single" : "top-fit");
  const [autoShortlist, setAutoShortlist] = useState(!isSingle);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setResult(null); setCopied(false); setError(null);
  }

  async function onGenerate() {
    setBusy(true); reset();
    try {
      const r = await build({
        data: isSingle
          ? { scope: "single", ids: [grantId!], autoShortlist: false, maxItems: 1 }
          : { scope: scope as Exclude<Scope, "single">, autoShortlist, maxItems: 25 },
      });
      setResult(r as Result);
      if (r.ok && r.shortlistedCount > 0) {
        qc.invalidateQueries({ queryKey: ["grants"] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!result?.ok) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Clipboard blocked by the browser. Use Download instead.");
    }
  }

  function onDownload() {
    if (!result?.ok) return;
    const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iial-briefing-${result.generatedAt.slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function onOpenNotebookLM() {
    window.open("https://notebooklm.google.com/", "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} className="gap-2">
          <BookOpenText className="h-4 w-4" />
          {label ?? "NotebookLM"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate a NotebookLM briefing
          </DialogTitle>
          <DialogDescription>
            We build a single evidence-cited Markdown document. Paste it into NotebookLM as one source — every claim links to the funder's own page.
          </DialogDescription>
        </DialogHeader>

        {/* ── Scope picker ───────────────────────────────────── */}
        {!result?.ok && (
          <div className="space-y-3">
            {isSingle ? (
              <div className="rounded-md border p-3 bg-primary/5 text-xs">
                <p className="font-medium text-sm mb-1">Deep-dive briefing</p>
                <p className="text-muted-foreground">
                  Generates a single high-fidelity NotebookLM source for this grant only — every field, every citation, the full workflow timeline, and tuned questions for deep analysis.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {MULTI_SCOPES.map((s) => {
                    const active = scope === s.id;
                    return (
                      <button
                        key={s.id} type="button"
                        onClick={() => setScope(s.id)}
                        className={cn(
                          "w-full text-left rounded-md border p-3 transition-all hover:border-primary/60",
                          active && "border-primary ring-2 ring-primary/20 bg-primary/5",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{s.title}</span>
                          {active && <Badge variant="default" className="text-[10px] h-4">Selected</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.subtitle}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label className="text-xs font-medium">Auto-mark as Shortlisted</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Move the included grants to your shortlist when the briefing is generated. Skips grants already in a proposal.
                    </p>
                  </div>
                  <Switch checked={autoShortlist} onCheckedChange={setAutoShortlist} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────── */}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
        {result && !result.ok && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs">{result.message}</p>
          </div>
        )}

        {/* ── Result panel ───────────────────────────────────── */}
        {result?.ok && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-3 gap-3 text-center">
              <Stat label="Grants" value={result.count} />
              <Stat label="With citations" value={result.grantsWithEvidence} />
              <Stat label="Evidence spans" value={result.totalSpans} />
            </div>
            {result.shortlistedCount > 0 && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {result.shortlistedCount} grant(s) moved to your Shortlist.
              </p>
            )}

            <div className="rounded-md border bg-card p-3 text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
              <p className="font-medium text-foreground">How to load it</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Click <strong>Open NotebookLM</strong> below.</li>
                <li>Create a notebook → <strong>Add source</strong> → <strong>Paste text</strong>.</li>
                <li>Paste (your briefing is already in the clipboard if you copied it), or upload the downloaded .md file.</li>
                <li>Generate an Audio Overview or use the suggested questions at the bottom of the briefing.</li>
              </ol>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={onCopy}>
                {copied ? <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={onDownload}>
                <Download className="h-4 w-4 mr-1.5" /> Download
              </Button>
              <Button size="sm" onClick={onOpenNotebookLM}>
                <ExternalLink className="h-4 w-4 mr-1.5" /> Open NotebookLM
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result?.ok && (
            <Button onClick={onGenerate} disabled={busy}>
              {busy ? "Generating…" : "Generate briefing"}
            </Button>
          )}
          {result?.ok && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Generate another
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
