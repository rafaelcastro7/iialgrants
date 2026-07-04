// Win-rate + funnel + time-in-stage analytics (Instrumentl-style), derived
// deterministically from grant_events. Admin-only.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { getPipelineAnalytics } from "@/lib/grants.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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

const chartConfig = {
  count: {
    label: "Grants",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function PipelineAnalyticsCard() {
  const fn = useServerFn(getPipelineAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-analytics"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="space-y-2">
          <Skeleton className="h-4 w-36 rounded-full" />
          <Skeleton className="h-3 w-56 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  const chartData = FUNNEL.map((stage) => ({
    stage: stage.label,
    count: data.statusCounts[stage.key] ?? 0,
    median: data.medianDaysInStage[stage.key] ?? null,
  }));
  const fmtPct = (n: number | null) => (n == null ? "-" : `${Math.round(n * 100)}%`);

  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-display">Pipeline analytics</CardTitle>
            <p className="text-sm text-muted-foreground">
              Derived from the grant event timeline. Deterministic, no estimates.
            </p>
          </div>
          <Badge
            variant="secondary"
            className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]"
          >
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 text-sm md:grid-cols-4">
          <Metric label="Total grants" value={String(data.total)} />
          <Metric label="Win rate" value={fmtPct(data.winRate)} />
          <Metric label="Submitted" value={String(data.submitted)} />
          <Metric label="Won / Lost" value={`${data.won} / ${data.lost}`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <BarChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="stage"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                interval={0}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ChartContainer>

          <div className="space-y-3">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Conversion rates
              </p>
              <div className="mt-3 space-y-2">
                <Conv
                  label="Scored to shortlist"
                  value={fmtPct(data.conversions.scoredToShortlisted)}
                />
                <Conv
                  label="Shortlist to draft"
                  value={fmtPct(data.conversions.shortlistedToProposal)}
                />
                <Conv
                  label="Draft to submit"
                  value={fmtPct(data.conversions.proposalToSubmitted)}
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Median time in stage
              </p>
              <div className="mt-3 space-y-2">
                {FUNNEL.map((stage) => {
                  const median = data.medianDaysInStage[stage.key];
                  return (
                    <div
                      key={stage.key}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">{stage.label}</span>
                      <span className="font-medium tabular-nums">
                        {median != null ? `${Math.round(median)}d` : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Conv({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
