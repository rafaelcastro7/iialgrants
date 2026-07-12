import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Lightbulb,
  ListChecks,
  NotebookPen,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAutonomyIntel } from "@/lib/autonomy-intel.functions";
import type { AutonomyIntel } from "@/lib/autonomy-intel.server";
import { PageContainer, PageHeader, StatCard, StatGrid } from "@/components/PageLayout";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const qo = queryOptions({
  queryKey: ["autonomy-intel"],
  queryFn: () => getAutonomyIntel(),
});

export const Route = createFileRoute("/_authenticated/autonomy")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  errorComponent: ({ error }) => (
    <PageContainer size="wide">
      <PageHeader eyebrow="Autonomy" title="Mission control" />
      <p className="text-sm text-destructive">
        Could not load autonomy intel: {error.message}. This view is admin-only and reads local
        daemon output on the server.
      </p>
    </PageContainer>
  ),
  component: AutonomyPage,
});

function AutonomyPage() {
  const fetchIntel = useServerFn(getAutonomyIntel);
  const { data } = useSuspenseQuery({
    queryKey: ["autonomy-intel"],
    queryFn: () => fetchIntel(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const selfCheckOk = data.selfCheck.ok;

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Autonomy"
        title="Mission control"
        description="Live view of the local self-improvement daemons and everything they learn: memory, lessons, self-improvement backlog, techniques, and skills. Read-only, on-device, zero cloud tokens."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  selfCheckOk ? "animate-pulse bg-emerald-500" : "bg-amber-500",
                )}
              />
              {selfCheckOk ? "Operational" : "Needs review"}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Cpu className="h-3.5 w-3.5" /> 0 cloud tokens
            </Badge>
            <span className="text-xs text-muted-foreground">
              refreshed {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
            </span>
          </div>
        }
      />

      <SelfCheckPanel selfCheck={data.selfCheck} regressions={data.regressions} />

      <DaemonStrip daemons={data.daemons} />

      {data.scorecard && <Scorecard intel={data} />}

      {data.regressions.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> Regressions flagged by self-evaluation
          </div>
          <ul className="mt-2 space-y-1 text-sm text-destructive/90">
            {data.regressions.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {data.repairs.length > 0 && (
        <FeedCard
          icon={Wrench}
          title="Self-healing actions"
          subtitle="Watchdog restarts, kills, and degraded-daemon flags"
          empty="No repairs needed."
          lines={data.repairs}
        />
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <FeedCard
          icon={RadioTower}
          title="Live audit feed"
          subtitle="Process, code, and data anomalies"
          empty="No anomalies of the known classes right now."
          lines={data.auditFindings}
        />
        <BacklogCard queue={data.improvementQueue} />
      </div>

      {data.criticisms && <CriticismsCard criticisms={data.criticisms} />}

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <ListCard
          icon={Lightbulb}
          title="Lessons learned"
          subtitle="Extracted from memory + working logs"
          empty="No lessons recorded yet."
          items={data.lessons}
        />
        <TechniquesCard techniques={data.techniques} />
      </div>

      <SkillsCard skills={data.skills} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <MemoryCard memory={data.memory} />
        <ObsidianCard obsidian={data.obsidian} />
      </div>
    </PageContainer>
  );
}

function SelfCheckPanel({
  regressions,
  selfCheck,
}: {
  regressions: string[];
  selfCheck: AutonomyIntel["selfCheck"];
}) {
  return (
    <section
      className={cn(
        "rounded-xl border p-4 shadow-sm",
        selfCheck.ok
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/35 bg-amber-500/5",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              selfCheck.ok ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {selfCheck.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            Self-improvement self-check: {selfCheck.label}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            This is computed from unit-tested logic, not log copy: daemon liveness, silent/stale
            detection, and scorecard regression checks are deterministic and covered by Vitest.
          </p>
          {regressions.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-destructive">
              {regressions.map((regression) => (
                <li key={regression} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{regression}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:min-w-[460px]">
          {selfCheck.daemons.map((daemon) => (
            <div key={daemon.key} className="rounded-md border bg-card/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold">{daemon.name}</span>
                <Badge
                  variant={daemon.status === "healthy" ? "default" : "secondary"}
                  className={cn(
                    "shrink-0 text-[10px]",
                    daemon.status === "healthy" && "bg-emerald-600 hover:bg-emerald-600",
                    daemon.status === "stale" && "bg-amber-500 text-white hover:bg-amber-500",
                  )}
                >
                  {daemon.status}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{daemon.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DaemonStrip({ daemons }: { daemons: AutonomyIntel["daemons"] }) {
  const ICONS: Record<string, ComponentType<{ className?: string }>> = {
    audit: RadioTower,
    "self-eval": FlaskConical,
    improvement: Sparkles,
  };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {daemons.map((d) => {
        const Icon = ICONS[d.key] ?? Bot;
        return (
          <div key={d.key} className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.description}</div>
                </div>
              </div>
              <Badge
                variant={d.alive ? "default" : "secondary"}
                className={cn("gap-1.5", d.alive && "bg-emerald-600 hover:bg-emerald-600")}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    d.alive ? "animate-pulse bg-white" : "bg-muted-foreground/50",
                  )}
                />
                {d.alive ? "running" : "stale"}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>every {d.intervalMin ?? "?"}m</span>
              <span>
                {d.lastCycleAt
                  ? `last cycle ${formatDistanceToNow(new Date(d.lastCycleAt), { addSuffix: true })}`
                  : "no cycles logged"}
              </span>
            </div>
            {d.recent.length > 0 && (
              <div className="mt-3 max-h-28 overflow-y-auto overflow-x-hidden rounded-md bg-muted/40 p-2">
                <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {d.recent.slice(-6).map((line, i) => (
                    <li key={i} className="break-words" title={line}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Scorecard({ intel }: { intel: AutonomyIntel }) {
  const s = intel.scorecard!;
  return (
    <div className="space-y-4">
      <SectionTitle
        icon={Activity}
        title="Product self-evaluation"
        subtitle={`Scorecard updated ${formatDistanceToNow(new Date(s.ts), { addSuffix: true })}`}
      />
      <StatGrid columns={4}>
        <StatCard label="Grants" value={s.total} sublabel={`${s.active} active`} icon={Database} />
        <StatCard
          label="Grounding coverage"
          value={`${s.grounding_coverage_pct}%`}
          sublabel={`${s.scored_with_eval} evaluated`}
          icon={ShieldCheck}
          tone={s.grounding_coverage_pct >= 90 ? "success" : "warning"}
        />
        <StatCard
          label="Data completeness"
          value={`${s.data_completeness_pct}%`}
          sublabel="avg of 5 key facts"
          icon={Layers}
          tone={s.data_completeness_pct >= 70 ? "success" : "warning"}
        />
        <StatCard
          label="Fit median"
          value={s.fit_median.toFixed(2)}
          sublabel={`range ${s.fit_range[0].toFixed(2)}-${s.fit_range[1].toFixed(2)}`}
          icon={BrainCircuit}
        />
        <StatCard
          label="Stuck grants"
          value={s.stuck_at_max_attempts}
          sublabel="max attempts, unpinned"
          icon={AlertTriangle}
          tone={s.stuck_at_max_attempts > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Duplicate clusters"
          value={s.duplicate_clusters}
          icon={GitBranch}
          tone={s.duplicate_clusters > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Fabricated reqs"
          value={s.fabricated_requirements}
          sublabel="should be 0"
          icon={ShieldCheck}
          tone={s.fabricated_requirements > 0 ? "danger" : "success"}
        />
        <StatCard
          label="Proposals reviewed"
          value={`${s.proposals_reviewed}/${s.proposals}`}
          icon={ListChecks}
        />
      </StatGrid>

      {intel.trend.length > 1 && <TrendChart trend={intel.trend} />}
    </div>
  );
}

function TrendChart({ trend }: { trend: AutonomyIntel["trend"] }) {
  const data = trend.map((p) => ({
    t: new Date(p.ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit" }),
    Grounding: p.grounding,
    Completeness: p.completeness,
  }));
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold">Quality trend</div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gGrounding" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.62 0.13 165)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.62 0.13 165)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCompleteness" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.65 0.15 45)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.65 0.15 45)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={36} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="Grounding"
              stroke="oklch(0.62 0.13 165)"
              fill="url(#gGrounding)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="Completeness"
              stroke="oklch(0.65 0.15 45)"
              fill="url(#gCompleteness)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FeedCard({
  icon: Icon,
  title,
  subtitle,
  empty,
  lines,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  empty: string;
  lines: string[];
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <SectionTitle icon={Icon} title={title} subtitle={subtitle} />
      {lines.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto font-mono text-[11px] leading-relaxed">
          {lines
            .slice()
            .reverse()
            .map((line, i) => (
              <li
                key={i}
                className="break-words border-b border-border/40 pb-1.5 text-muted-foreground last:border-0"
              >
                {line}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function BacklogCard({ queue }: { queue: string | null }) {
  // The improvement daemon writes a small markdown file; render its bullet/
  // priority lines as a clean list without dangerouslySetInnerHTML.
  const lines = (queue ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\[P\d\]/.test(l) || /^[-*]\s/.test(l));
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <SectionTitle
        icon={Sparkles}
        title="Self-improvement backlog"
        subtitle="Synthesized locally; proposals only, never auto-applied"
      />
      {lines.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          The improvement daemon has not written a backlog yet (it runs when the GPU is idle).
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lines.map((line, i) => {
            const pm = line.match(/^\[(P\d)\]\s*(.*)$/);
            const priority = pm?.[1];
            const text = (pm?.[2] ?? line).replace(/^[-*]\s+/, "").replace(/\*\*/g, "");
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                {priority && (
                  <Badge
                    variant={priority === "P1" ? "destructive" : "secondary"}
                    className="mt-0.5 shrink-0 text-[10px]"
                  >
                    {priority}
                  </Badge>
                )}
                <span className="leading-6">{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CriticismsCard({ criticisms }: { criticisms: string | null }) {
  // The self-criticism daemon writes markdown; extract [WEAKNESS], [METRIC], [ROOT], [FIX] lines.
  const blocks = (criticisms ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\[WEAKNESS\]|^\[METRIC\]|^\[ROOT\]|^\[FIX\]|^\[NONE\]/.test(l));

  return (
    <div className="min-w-0 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
      <SectionTitle
        icon={AlertTriangle}
        title="System self-criticism"
        subtitle="Pipeline analysis: detection & extraction weaknesses"
      />
      {blocks.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          The self-criticism daemon has not analyzed pipelines yet (it runs every 60 minutes).
        </p>
      ) : blocks.some((l) => l.includes("[NONE]")) ? (
        <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-center text-sm text-emerald-700">
          ✓ No actionable weaknesses detected — pipelines are sound.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {blocks.map((line, i) => {
            const tag = line.match(/^\[([A-Z]+)\]/)?.[1];
            const text = line.replace(/^\[[A-Z]+\]\s*/, "").replace(/\*\*/g, "");
            const tagColor: Record<string, string> = {
              WEAKNESS: "bg-destructive/10 text-destructive",
              METRIC: "bg-amber-500/10 text-amber-700",
              ROOT: "bg-purple-500/10 text-purple-700",
              FIX: "bg-emerald-500/10 text-emerald-700",
            };
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                {tag && (
                  <Badge variant="outline" className={cn("mt-0.5 shrink-0 text-[10px]", tagColor[tag])}>
                    {tag}
                  </Badge>
                )}
                <span className="leading-6 text-muted-foreground">{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ListCard({
  icon: Icon,
  title,
  subtitle,
  empty,
  items,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  empty: string;
  items: string[];
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <SectionTitle icon={Icon} title={title} subtitle={subtitle} />
      {items.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-6">
              <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TechniquesCard({ techniques }: { techniques: string[] }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <SectionTitle
        icon={Wrench}
        title="Best techniques"
        subtitle="Reusable patterns proven in this codebase"
      />
      {techniques.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          No techniques documented yet (docs/TECHNIQUES.md).
        </p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {techniques.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-6">
              <Wrench className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SkillsCard({ skills }: { skills: AutonomyIntel["skills"] }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <SectionTitle
        icon={BrainCircuit}
        title={`Skills available (${skills.length})`}
        subtitle="Claude skills wired into this environment"
      />
      {skills.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          No local skills directory detected.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <div key={skill.name} className="rounded-md border bg-background/60 p-3">
              <div className="font-mono text-xs font-semibold text-primary">{skill.name}</div>
              {skill.description && (
                <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                  {skill.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({ memory }: { memory: AutonomyIntel["memory"] }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm lg:col-span-2">
      <SectionTitle
        icon={Database}
        title={`Memory (${memory.files.length} notes)`}
        subtitle="Persistent cross-session project memory"
      />
      {memory.files.length > 0 ? (
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {memory.files.map((f) => (
            <li key={f.name} className="text-sm leading-5">
              <span className="font-mono text-xs font-semibold text-primary">{f.name}</span>
              {f.description && <span className="text-muted-foreground"> - {f.description}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No memory notes found.</p>
      )}
      {memory.now && (
        <details className="mt-4 rounded-md border bg-background/60 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
            Working buffer (.remember/now.md)
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
            {memory.now}
          </pre>
        </details>
      )}
    </div>
  );
}

function ObsidianCard({ obsidian }: { obsidian: AutonomyIntel["obsidian"] }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <SectionTitle
        icon={NotebookPen}
        title="Obsidian vault"
        subtitle="Graph + backlinks over memory"
      />
      <div className="mt-3 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              obsidian.vaultExists ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          {obsidian.vaultExists ? "Vault linked" : "Vault not found"}
        </div>
        <div className="text-muted-foreground">
          <div>
            {obsidian.projectNotes} project note{obsidian.projectNotes === 1 ? "" : "s"} browsable
          </div>
          <div className="mt-1">{obsidian.readme ? "README present" : "no README"}</div>
        </div>
        <code
          className="block truncate rounded-md border bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground"
          title={obsidian.vaultPath}
        >
          {obsidian.vaultPath}
        </code>
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
