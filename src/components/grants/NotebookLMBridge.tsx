// NotebookLM bridge UI: export a markdown bundle of recently-discovered grants
// for human curation, then mark selected IIAL IDs as shortlisted.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { exportGrantsForNotebookLM, markGrantsCurated } from "@/lib/grants.functions";

export function NotebookLMBridge({ fr }: { fr: boolean }) {
  const exportFn = useServerFn(exportGrantsForNotebookLM);
  const curateFn = useServerFn(markGrantsCurated);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"export" | "curate" | null>(null);
  const [bundle, setBundle] = useState<{ count: number; generatedAt: string; markdown: string; quality?: Record<string, unknown> } | null>(null);
  const [ids, setIds] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingEnrich, setPendingEnrich] = useState<{ incompleteIds: string[]; total: number } | null>(null);

  async function runExport(opts: { autoEnrich?: boolean; force?: boolean }) {
    setBusy("export"); setMsg(null); setPendingEnrich(null);
    try {
      const r = await exportFn({ data: { status: "discovered", limit: 25, autoEnrich: !!opts.autoEnrich, force: !!opts.force, language: "auto" } });
      if (r.ok === false) {
        setPendingEnrich({ incompleteIds: r.incompleteIds, total: r.total });
        setMsg(r.message);
        return;
      }
      setBundle({ count: r.count, generatedAt: r.generatedAt, markdown: r.markdown, quality: r.quality as Record<string, unknown> });
      const blob = new Blob([r.markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `iial-curation-${r.generatedAt.slice(0, 10)}.md`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      const enrichSuffix = r.enrichment
        ? (fr ? ` · Enrichi: ${r.enrichment.succeeded}/${r.enrichment.attempted}` : ` · Enriched: ${r.enrichment.succeeded}/${r.enrichment.attempted}`)
        : "";
      setMsg((fr
        ? `${r.count} subvention(s) exportée(s). Glissez le fichier .md dans NotebookLM.`
        : `${r.count} grant(s) exported. Drag the .md into NotebookLM as a source.`) + enrichSuffix);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }
  const onExport = () => runExport({});

  async function onCurate() {
    setBusy("curate"); setMsg(null);
    const list = ids
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    if (list.length === 0) {
      setMsg(fr ? "Collez au moins un ID IIAL valide (UUID)." : "Paste at least one valid IIAL id (UUID).");
      setBusy(null); return;
    }
    try {
      const r = await curateFn({ data: { grantIds: list, note: note || undefined } });
      setMsg(fr ? `${r.updated} marquée(s) comme retenue(s).` : `${r.updated} marked as shortlisted.`);
      setIds(""); setNote("");
      await qc.invalidateQueries({ queryKey: ["grants"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">NotebookLM</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fr ? "Pont NotebookLM" : "NotebookLM bridge"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{fr ? "1. Exporter pour curation" : "1. Export for curation"}</h3>
            <p className="text-xs text-muted-foreground">
              {fr
                ? "Télécharge un .md avec les 25 subventions récemment découvertes. Importe-le dans NotebookLM comme source unique, pose des questions, puis copie les IDs IIAL des subventions approuvées."
                : "Downloads a .md bundle of the 25 most recently discovered grants. Import it into NotebookLM as a single source, ask questions, then copy the IIAL ids of the approved grants."}
            </p>
            <Button size="sm" onClick={onExport} disabled={busy === "export"}>
              {busy === "export" ? "…" : (fr ? "Télécharger le bundle" : "Download bundle")}
            </Button>
            {pendingEnrich && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 space-y-2">
                <p className="text-xs">
                  {fr
                    ? `${pendingEnrich.incompleteIds.length}/${pendingEnrich.total} subventions sans montant/échéance/secteurs.`
                    : `${pendingEnrich.incompleteIds.length}/${pendingEnrich.total} grants missing amount/deadline/sectors.`}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => runExport({ autoEnrich: true })} disabled={busy === "export"}>
                    {fr ? "Enrichir puis exporter" : "Enrich then export"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => runExport({ force: true })} disabled={busy === "export"}>
                    {fr ? "Exporter quand même" : "Export anyway"}
                  </Button>
                </div>
              </div>
            )}
            {bundle && (
              <p className="text-xs text-muted-foreground">
                {fr ? "Bundle généré" : "Generated"} {new Date(bundle.generatedAt).toLocaleString()} · {bundle.count} {fr ? "fiches" : "items"}
              </p>
            )}
          </section>
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">{fr ? "2. Marquer les approuvées" : "2. Mark approved"}</h3>
            <Label className="text-xs">{fr ? "IDs IIAL (un par ligne, virgule ou espace)" : "IIAL ids (one per line, comma or space)"}</Label>
            <Textarea rows={4} value={ids} onChange={(e) => setIds(e.target.value)} placeholder="abc12345-..." className="font-mono text-xs" />
            <Label className="text-xs">{fr ? "Note de curation (optionnel)" : "Curator note (optional)"}</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={fr ? "Pourquoi ces choix..." : "Why these choices..."} />
            <Button size="sm" onClick={onCurate} disabled={busy === "curate"}>
              {busy === "curate" ? "…" : (fr ? "Marquer comme retenues" : "Mark as shortlisted")}
            </Button>
          </section>
          {msg && <p className="text-xs text-muted-foreground border-t pt-2">{msg}</p>}
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
