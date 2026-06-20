import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listFunderCandidates, approveFunderCandidate, rejectFunderCandidate,
  runSourceCuratorNow, listSourceIngestRuns,
} from "@/lib/funder-candidates.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/candidates")({
  component: CandidatesPage,
});

function CandidatesPage() {
  const router = useRouter();
  const list = useServerFn(listFunderCandidates);
  const approve = useServerFn(approveFunderCandidate);
  const reject = useServerFn(rejectFunderCandidate);
  const runNow = useServerFn(runSourceCuratorNow);
  const runs = useServerFn(listSourceIngestRuns);
  const [tab, setTab] = useState<"pending_review" | "approved" | "rejected">("pending_review");
  const [busy, setBusy] = useState(false);

  const qCands = useQuery({
    queryKey: ["funder-candidates", tab],
    queryFn: () => list({ data: { status: tab, limit: 100 } }),
  });
  const qRuns = useQuery({ queryKey: ["source-ingest-runs"], queryFn: () => runs() });

  async function handleApprove(id: string) {
    setBusy(true);
    try { await approve({ data: { id } }); toast.success("Approved & seeded"); router.invalidate(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function handleReject(id: string) {
    const reason = window.prompt("Reject reason (optional)") ?? undefined;
    setBusy(true);
    try { await reject({ data: { id, reason } }); toast.success("Rejected"); router.invalidate(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function handleRunNow() {
    setBusy(true);
    try {
      const r = await runNow();
      toast.success(`Curator: ${r.totals.new} new, ${r.totals.auto} auto-seeded, ${r.totals.dup} dup`);
      router.invalidate();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Funder Candidates</h1>
          <p className="text-sm text-muted-foreground">
            Auto-discovered funders from CRA / TBS G&amp;C / PFC. Review and approve to add to the catalog.
          </p>
        </div>
        <Button onClick={handleRunNow} disabled={busy}>
          {busy ? "Running…" : "Run curator now"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending_review">Pending review</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="space-y-3 pt-4">
          {qCands.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {qCands.data?.length === 0 && <p className="text-sm text-muted-foreground">No candidates.</p>}
          {qCands.data?.map((c) => (
            <Card key={c.id as string}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                <div>
                  <CardTitle className="text-base">{c.name as string}</CardTitle>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.bn_number ? <Badge variant="outline">BN {c.bn_number as string}</Badge> : null}
                    {c.province ? <Badge variant="outline">{c.province as string}</Badge> : null}
                    {c.funder_type ? <Badge variant="outline">{c.funder_type as string}</Badge> : null}
                    {(c.source_signals as string[] | null)?.map((s) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{c.score as number}</div>
                  <div className="text-xs text-muted-foreground">score</div>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4 text-sm">
                <div className="text-muted-foreground truncate">
                  {c.website ? (
                    <a href={c.website as string} target="_blank" rel="noreferrer" className="underline">
                      {c.website as string}
                    </a>
                  ) : <span>No website</span>}
                </div>
                {tab === "pending_review" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleReject(c.id as string)}>Reject</Button>
                    <Button size="sm" disabled={busy} onClick={() => handleApprove(c.id as string)}>Approve</Button>
                  </div>
                )}
                {tab === "rejected" && c.reject_reason ? (
                  <div className="text-xs text-muted-foreground italic">{c.reject_reason as string}</div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent ingest runs</CardTitle></CardHeader>
        <CardContent>
          {qRuns.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {qRuns.data?.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
          <ul className="text-xs space-y-1 font-mono">
            {qRuns.data?.map((r) => (
              <li key={r.id as string} className="flex gap-2">
                <span className="text-muted-foreground">{new Date(r.run_at as string).toISOString().slice(0, 16)}</span>
                <span className="font-semibold">{r.dataset as string}</span>
                <span>rows={r.rows_in as number}</span>
                <span>new={r.candidates_out as number}</span>
                <span>auto={r.auto_approved as number}</span>
                <span>dup={r.duplicates as number}</span>
                <span>err={r.errors as number}</span>
                <span className={r.status === "succeeded" ? "text-emerald-600" : "text-red-600"}>{r.status as string}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
