// Win-rate + funnel + time-in-stage analytics (Instrumentl-style), derived
// deterministically from grant_events. Admin-only.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPipelineAnalytics } from "@/lib/grants.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FUNNEL: Array<{
  key: "discovered" | "enriched" | "scored" | "shortlisted" | "in_proposal" | "submitted" | "won";
  label: string;
}> = [
  { key: "discovered", label: "Discovered" },
  { key: "enriched", label: "Enriched" },
  { key: "scored", label: "Scored" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "in_proposal", label: "Drafting" },
  { key: "submitted", label: "Submitted" },
  { key: "won", label: "Won" },
];

export function PipelineAnalyticsCard() {
  const fn = useServerFn(getPipelineAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-analytics"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline analytics</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(1, ...FUNNEL.map((s) => data.statusCounts[s.key] ?? 0));
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline analytics</CardTitle>
        <p className="text-xs text-muted-foreground">
          Derived from the grant event timeline — deterministic, no estimates.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Stat label="Total grants" value={String(data.total)} />
          <Stat label="Win rate" value={data.winRate == null ? "—" : pct(data.winRate)} />
          <Stat label="Submitted" value={String(data.submitted)} />
          <Stat label="Won / Lost" value={`${data.won} / ${data.lost}`} />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Funnel</p>
          <ul className="space-y-1">
            {FUNNEL.map((s) => {
              const n = data.statusCounts[s.key] ?? 0;
              const median = data.medianDaysInStage[s.key];
              return (
                <li key={s.key} className="text-xs flex items-center gap-2">
                  <span className="w-24 shrink-0">{s.label}</span>
                  <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                    <div
                      className="h-full rounded bg-[#3b6fa0]"
                      style={{ width: `${(n / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums">{n}</span>
                  <span className="w-20 text-right text-muted-foreground tabular-nums">
                    {median != null ? `${median}d in stage` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Conversion rates
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Conv label="Scored → Shortlist" value={pct(data.conversions.scoredToShortlisted)} />
            <Conv label="Shortlist → Draft" value={pct(data.conversions.shortlistedToProposal)} />
            <Conv label="Draft → Submit" value={pct(data.conversions.proposalToSubmitted)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Conv({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-center">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
