import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Gauge,
  Landmark,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { isActiveGrantStatus, type GrantStatus } from "@/agents/pipeline-stages.shared";
import { DiscoveryProgress } from "@/components/grants/DiscoveryProgress";
import { EventLog } from "@/components/grants/EventLog";
import { FunderSelector } from "@/components/grants/FunderSelector";
import { NotebookLMBridge } from "@/components/grants/NotebookLMBridge";
import type { GrantRowData } from "@/components/grants/GrantRow";
import { SORT_LABELS, type SortKey } from "@/components/grants/grant-filters.utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ActiveJob = { jobId: string; queued: number };

type V2GrantsWorkspaceProps = {
  activeJob: ActiveJob | null;
  allGrants: GrantRowData[];
  autoMsg: string | null;
  discoveryMsg: string | null;
  eligibleOnly: boolean;
  error: string | null;
  evaluatingIds: Set<string>;
  filteredGrants: GrantRowData[];
  isAdmin: boolean;
  jurisdiction: string;
  onlyWithDeadline: boolean;
  pending: string | null;
  search: string;
  selectedFunders: Set<string>;
  sortKey: SortKey;
  onClearAutoMsg: () => void;
  onClearDiscoveryMsg: () => void;
  onClearError: () => void;
  onCloseJob: () => void;
  onDiscoverAll: () => void;
  onDraft: (grantId: string) => void;
  onEligibleOnlyChange: (next: boolean) => void;
  onEnrich: (grantId: string) => void;
  onEvaluate: (grantId: string) => void;
  onJurisdictionChange: (next: string) => void;
  onOnlyWithDeadlineChange: (next: boolean) => void;
  onSearchChange: (next: string) => void;
  onSelectedFundersChange: (next: Set<string>) => void;
  onSortKeyChange: (next: SortKey) => void;
};

const DAY_MS = 86_400_000;

const STATUS_LABEL: Record<string, string> = {
  archived: "Archived",
  discovered: "Lead",
  enriched: "Verified",
  expired: "Expired",
  in_proposal: "Drafting",
  lost: "Not awarded",
  scored: "Scored",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  won: "Awarded",
};

const PIPELINE_STAGES: Array<{
  description: string;
  icon: LucideIcon;
  key: string;
  label: string;
  statuses: string[];
}> = [
  {
    description: "Fresh leads that still need source verification.",
    icon: Search,
    key: "discover",
    label: "Discover",
    statuses: ["discovered"],
  },
  {
    description: "Structured facts and fit checks are being assembled.",
    icon: ShieldCheck,
    key: "qualify",
    label: "Qualify",
    statuses: ["enriched", "scored"],
  },
  {
    description: "Opportunities worth proposal time.",
    icon: Target,
    key: "pursue",
    label: "Pursue",
    statuses: ["shortlisted", "in_proposal"],
  },
  {
    description: "Filed applications waiting on funder response.",
    icon: Send,
    key: "submit",
    label: "Submit",
    statuses: ["submitted"],
  },
  {
    description: "Wins to manage for reporting and renewal.",
    icon: CheckCircle2,
    key: "award",
    label: "Award",
    statuses: ["won"],
  },
  {
    description: "Closed, expired, or deprioritized records.",
    icon: XCircle,
    key: "close",
    label: "Close",
    statuses: ["lost", "expired", "archived"],
  },
];

export function V2GrantsWorkspace({
  activeJob,
  allGrants,
  autoMsg,
  discoveryMsg,
  eligibleOnly,
  error,
  evaluatingIds,
  filteredGrants,
  isAdmin,
  jurisdiction,
  onlyWithDeadline,
  pending,
  search,
  selectedFunders,
  sortKey,
  onClearAutoMsg,
  onClearDiscoveryMsg,
  onClearError,
  onCloseJob,
  onDiscoverAll,
  onDraft,
  onEligibleOnlyChange,
  onEnrich,
  onEvaluate,
  onJurisdictionChange,
  onOnlyWithDeadlineChange,
  onSearchChange,
  onSelectedFundersChange,
  onSortKeyChange,
}: V2GrantsWorkspaceProps) {
  const [tab, setTab] = useState("queue");

  const activeAll = useMemo(
    () => allGrants.filter((g) => isActiveGrantStatus(g.status)),
    [allGrants],
  );
  const activeFiltered = useMemo(
    () => filteredGrants.filter((g) => isActiveGrantStatus(g.status)),
    [filteredGrants],
  );

  const metrics = useMemo(() => {
    const eligible = activeAll.filter((g) => g.evaluation?.eligibility_pass);
    const scored = activeAll.filter((g) => g.evaluation);
    const urgent = activeAll.filter((g) => {
      const deadline = deadlineState(g.deadline);
      return deadline.days != null && deadline.days >= 0 && deadline.days <= 30;
    });
    const proposalReady = activeAll.filter((g) =>
      ["scored", "shortlisted", "in_proposal"].includes(g.status),
    );
    const value = eligible.reduce((sum, g) => sum + (g.amount_cad_max ?? g.amount_cad_min ?? 0), 0);
    const exceptions = activeAll.filter(hasOperationalRisk);
    return {
      eligible: eligible.length,
      exceptions: exceptions.length,
      proposalReady: proposalReady.length,
      scored: scored.length,
      total: activeAll.length,
      urgent: urgent.length,
      value,
    };
  }, [activeAll]);

  const queue = useMemo(
    () =>
      [...activeFiltered].sort((a, b) => {
        const av = priorityScore(a);
        const bv = priorityScore(b);
        if (av !== bv) return bv - av;
        return (fitValue(b) ?? -1) - (fitValue(a) ?? -1);
      }),
    [activeFiltered],
  );

  const nextFocus = queue.find((grant) => !["submitted", "won"].includes(grant.status)) ?? queue[0];
  const riskItems = useMemo(() => activeFiltered.filter(hasOperationalRisk), [activeFiltered]);
  const jurisdictions = useMemo(() => collectJurisdictions(allGrants), [allGrants]);

  return (
    <section className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:py-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.72fr)_380px]">
        <section className="overflow-hidden rounded-md border bg-card shadow-sm">
          <div className="grid min-h-[320px] lg:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="flex flex-col justify-between p-5 sm:p-6">
              <div>
                <Badge variant="outline" className="gap-2 rounded-md px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  Grant radar
                </Badge>
                <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl">
                  Prioritize every opportunity from source signal to proposal action.
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  A ranked operating queue for Canadian grants, with eligibility, deadlines, source
                  quality, and next action visible at scan speed.
                </p>
              </div>

              <div className="mt-6 grid gap-2 sm:grid-cols-4">
                <HeroMetric icon={Search} label="Active" value={metrics.total} />
                <HeroMetric icon={ShieldCheck} label="Eligible" value={metrics.eligible} />
                <HeroMetric icon={CalendarClock} label="Urgent" value={metrics.urgent} />
                <HeroMetric icon={Gauge} label="Risks" value={metrics.exceptions} />
              </div>
            </div>

            <aside className="border-t bg-muted/35 p-5 lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                    Next focus
                  </div>
                  <div className="mt-1 text-lg font-semibold leading-snug">
                    {nextFocus ? nextFocus.title : "Run discovery"}
                  </div>
                </div>
                <Sparkles className="h-5 w-5 shrink-0 text-brand" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {nextFocus
                  ? nextFocusCopy(nextFocus)
                  : "No active grants are ready for review. Start a discovery run to populate the radar."}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {nextFocus ? (
                  <Button asChild className="w-full gap-2">
                    <Link to="/grants/$id" params={{ id: nextFocus.id }}>
                      Open decision file <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-2"
                    disabled={!isAdmin || pending === "__discover__"}
                    onClick={onDiscoverAll}
                  >
                    {pending === "__discover__" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Run discovery
                  </Button>
                )}
                <Button asChild variant="outline" className="w-full gap-2">
                  <Link to="/fit-rules">
                    <ClipboardList className="h-4 w-4" />
                    Screening rules
                  </Link>
                </Button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                <MiniStat label="Scored" value={`${metrics.scored}`} />
                <MiniStat
                  label="Eligible value"
                  value={metrics.value ? formatCompactCad(metrics.value) : "$0"}
                />
              </div>
            </aside>
          </div>
        </section>

        <aside className="rounded-md border border-white/12 bg-[oklch(0.2_0.026_218)] p-5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-teal-200" />
            Operations console
          </div>
          <p className="mt-3 text-sm leading-6 text-white/68">
            Discovery, enrichment, fit scoring, and proposal handoff remain local-first and fully
            auditable.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
            <DarkMini label="LLM" value="Ollama" />
            <DarkMini label="Cost" value="$0 tokens" />
            <DarkMini label="DB" value="Supabase" />
            <DarkMini label="Access" value="RLS" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2 rounded-md border border-white/10 bg-white/[0.04] p-2">
            <NotebookLMBridge />
            {isAdmin && (
              <>
                <FunderSelector
                  fr={false}
                  selected={selectedFunders}
                  onChange={onSelectedFundersChange}
                />
                <Button
                  size="sm"
                  className="border-white/15 bg-white/[0.08] text-white hover:bg-white/15 hover:text-white"
                  disabled={pending === "__discover__"}
                  onClick={onDiscoverAll}
                >
                  {pending === "__discover__" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Discover
                </Button>
              </>
            )}
          </div>
        </aside>
      </div>

      {activeJob && (
        <DiscoveryProgress
          jobId={activeJob.jobId}
          queued={activeJob.queued}
          fr={false}
          onClose={onCloseJob}
        />
      )}

      <StatusMessages
        autoMsg={autoMsg}
        discoveryMsg={discoveryMsg}
        error={error}
        onClearAutoMsg={onClearAutoMsg}
        onClearDiscoveryMsg={onClearDiscoveryMsg}
        onClearError={onClearError}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail={`${metrics.scored} fit checks completed`}
          icon={SearchCheck}
          label="Decision coverage"
          value={`${metrics.scored}/${metrics.total}`}
        />
        <MetricCard
          detail="Eligible and scored opportunities"
          icon={CheckCircle2}
          label="Qualified"
          tone="success"
          value={metrics.eligible}
        />
        <MetricCard
          detail="Scored, shortlisted, or drafting"
          icon={FileText}
          label="Proposal ready"
          value={metrics.proposalReady}
        />
        <MetricCard
          detail="Deadline, data, or duplicate attention"
          icon={AlertTriangle}
          label="Exception queue"
          tone={metrics.exceptions > 0 ? "warning" : "neutral"}
          value={metrics.exceptions}
        />
      </div>

      <FilterPanel
        eligibleOnly={eligibleOnly}
        filteredCount={activeFiltered.length}
        jurisdiction={jurisdiction}
        jurisdictions={jurisdictions}
        onlyWithDeadline={onlyWithDeadline}
        search={search}
        sortKey={sortKey}
        totalCount={activeAll.length}
        onEligibleOnlyChange={onEligibleOnlyChange}
        onJurisdictionChange={onJurisdictionChange}
        onOnlyWithDeadlineChange={onOnlyWithDeadlineChange}
        onSearchChange={onSearchChange}
        onSortKeyChange={onSortKeyChange}
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col gap-3 rounded-md border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Prospect intelligence</h2>
            <p className="text-sm text-muted-foreground">
              Ranked queue, lifecycle board, and exceptions from the same source of truth.
            </p>
          </div>
          <TabsList className="h-10 self-start rounded-md">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="pipeline">Lifecycle</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="queue" className="mt-0">
          <DecisionQueue
            evaluatingIds={evaluatingIds}
            grants={queue}
            isAdmin={isAdmin}
            pending={pending}
            onDraft={onDraft}
            onEnrich={onEnrich}
            onEvaluate={onEvaluate}
          />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-0">
          <LifecycleBoard grants={activeFiltered} />
        </TabsContent>

        <TabsContent value="exceptions" className="mt-0">
          <ExceptionQueue
            evaluatingIds={evaluatingIds}
            grants={riskItems}
            isAdmin={isAdmin}
            pending={pending}
            onEnrich={onEnrich}
            onEvaluate={onEvaluate}
          />
        </TabsContent>
      </Tabs>

      {allGrants.length === 0 && (
        <section className="rounded-md border border-dashed bg-card px-5 py-12 text-center shadow-sm">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border bg-muted">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="mt-3 text-base font-semibold">No grants in the workspace</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
            Discovery will scan enabled funders and create source-linked grant records for review.
          </p>
          {isAdmin ? (
            <Button
              className="mt-4 gap-2"
              disabled={pending === "__discover__"}
              onClick={onDiscoverAll}
            >
              {pending === "__discover__" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Run discovery
            </Button>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">Ask an admin to run discovery.</p>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="rounded-md border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-base font-semibold">Discovery event log</h2>
            <p className="text-sm text-muted-foreground">
              Recent crawler and agent execution history.
            </p>
          </div>
          <div className="p-4">
            <EventLog fr={false} />
          </div>
        </section>
      )}
    </section>
  );
}

function StatusMessages({
  autoMsg,
  discoveryMsg,
  error,
  onClearAutoMsg,
  onClearDiscoveryMsg,
  onClearError,
}: {
  autoMsg: string | null;
  discoveryMsg: string | null;
  error: string | null;
  onClearAutoMsg: () => void;
  onClearDiscoveryMsg: () => void;
  onClearError: () => void;
}) {
  if (!autoMsg && !discoveryMsg && !error) return null;
  return (
    <div className="space-y-2">
      {error && (
        <Message tone="danger" onClear={onClearError}>
          {error}
        </Message>
      )}
      {autoMsg && <Message onClear={onClearAutoMsg}>{autoMsg}</Message>}
      {discoveryMsg && <Message onClear={onClearDiscoveryMsg}>{discoveryMsg}</Message>}
    </div>
  );
}

function Message({
  children,
  onClear,
  tone = "neutral",
}: {
  children: ReactNode;
  onClear: () => void;
  tone?: "danger" | "neutral";
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm shadow-sm",
        tone === "danger"
          ? "border-destructive/35 bg-destructive/5 text-destructive"
          : "bg-card text-muted-foreground",
      )}
    >
      <p className="min-w-0 break-words">{children}</p>
      <button
        type="button"
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        onClick={onClear}
        aria-label="Dismiss message"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function FilterPanel({
  eligibleOnly,
  filteredCount,
  jurisdiction,
  jurisdictions,
  onlyWithDeadline,
  search,
  sortKey,
  totalCount,
  onEligibleOnlyChange,
  onJurisdictionChange,
  onOnlyWithDeadlineChange,
  onSearchChange,
  onSortKeyChange,
}: {
  eligibleOnly: boolean;
  filteredCount: number;
  jurisdiction: string;
  jurisdictions: string[];
  onlyWithDeadline: boolean;
  search: string;
  sortKey: SortKey;
  totalCount: number;
  onEligibleOnlyChange: (next: boolean) => void;
  onJurisdictionChange: (next: string) => void;
  onOnlyWithDeadlineChange: (next: boolean) => void;
  onSearchChange: (next: string) => void;
  onSortKeyChange: (next: SortKey) => void;
}) {
  const hasFilters =
    search.trim() !== "" || jurisdiction !== "all" || eligibleOnly || onlyWithDeadline;

  return (
    <section className="rounded-md border bg-card p-3 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_190px_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search title or funder"
            aria-label="Search grants"
            className="pl-9"
          />
        </div>
        <Select value={sortKey} onValueChange={(value) => onSortKeyChange(value as SortKey)}>
          <SelectTrigger aria-label="Sort grants">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jurisdiction} onValueChange={onJurisdictionChange}>
          <SelectTrigger aria-label="Filter by jurisdiction">
            <SelectValue placeholder="Jurisdiction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jurisdictions</SelectItem>
            {jurisdictions.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button
            type="button"
            variant={eligibleOnly ? "default" : "outline"}
            size="sm"
            onClick={() => onEligibleOnlyChange(!eligibleOnly)}
            aria-pressed={eligibleOnly}
          >
            <CheckCircle2 className="h-4 w-4" />
            Eligible
          </Button>
          <Button
            type="button"
            variant={onlyWithDeadline ? "default" : "outline"}
            size="sm"
            onClick={() => onOnlyWithDeadlineChange(!onlyWithDeadline)}
            aria-pressed={onlyWithDeadline}
          >
            <CalendarClock className="h-4 w-4" />
            Deadline
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onSearchChange("");
                onJurisdictionChange("all");
                onEligibleOnlyChange(false);
                onOnlyWithDeadlineChange(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing <span className="font-semibold text-foreground">{filteredCount}</span> of{" "}
          <span className="font-semibold text-foreground">{totalCount}</span> active records
        </span>
        <span>Sorted by {SORT_LABELS[sortKey].toLowerCase()}</span>
      </div>
    </section>
  );
}

function DecisionQueue({
  evaluatingIds,
  grants,
  isAdmin,
  pending,
  onDraft,
  onEnrich,
  onEvaluate,
}: {
  evaluatingIds: Set<string>;
  grants: GrantRowData[];
  isAdmin: boolean;
  pending: string | null;
  onDraft: (grantId: string) => void;
  onEnrich: (grantId: string) => void;
  onEvaluate: (grantId: string) => void;
}) {
  if (grants.length === 0) {
    return (
      <EmptyPanel
        icon={Search}
        title="No active grants match this view"
        body="Adjust the filters or run discovery to add more funder records."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-md border bg-card shadow-sm">
      <div className="grid border-b bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground lg:grid-cols-[82px_minmax(0,1fr)_160px_150px_155px]">
        <span>Priority</span>
        <span>Opportunity</span>
        <span className="hidden lg:block">Funding</span>
        <span className="hidden lg:block">Deadline</span>
        <span className="hidden text-right lg:block">Action</span>
      </div>
      <div className="divide-y">
        {grants.map((grant) => (
          <QueueRow
            key={grant.id}
            grant={grant}
            isAdmin={isAdmin}
            pending={pending}
            evaluating={evaluatingIds.has(grant.id)}
            onDraft={onDraft}
            onEnrich={onEnrich}
            onEvaluate={onEvaluate}
          />
        ))}
      </div>
    </section>
  );
}

function QueueRow({
  evaluating,
  grant,
  isAdmin,
  pending,
  onDraft,
  onEnrich,
  onEvaluate,
}: {
  evaluating: boolean;
  grant: GrantRowData;
  isAdmin: boolean;
  pending: string | null;
  onDraft: (grantId: string) => void;
  onEnrich: (grantId: string) => void;
  onEvaluate: (grantId: string) => void;
}) {
  const deadline = deadlineState(grant.deadline);
  const fit = fitValue(grant);
  const verdict = verdictFor(grant);
  const funder = funderOf(grant);

  return (
    <div className="grid gap-3 px-4 py-4 transition-colors hover:bg-accent/45 lg:grid-cols-[82px_minmax(0,1fr)_160px_150px_155px] lg:items-center">
      <div className="flex lg:block">
        <PriorityBadge fit={fit} grant={grant} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            to="/grants/$id"
            params={{ id: grant.id }}
            className="min-w-0 text-sm font-semibold leading-snug text-foreground hover:text-primary hover:underline"
            title={grant.title}
          >
            {grant.title}
          </Link>
          <Badge variant="outline" className="rounded-md">
            {STATUS_LABEL[grant.status] ?? humanize(grant.status)}
          </Badge>
          {grant.evaluation?.eligibility_pass && (
            <Badge className="rounded-md border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
              Eligible
            </Badge>
          )}
          {(grant.duplicateGroupSize ?? 1) > 1 && (
            <Badge variant="outline" className="rounded-md border-amber-500/35 text-amber-700">
              {grant.duplicateGroupSize} similar
            </Badge>
          )}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{funder?.name ?? "Unknown funder"}</span>
          </span>
          {funder?.jurisdiction && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {funder.jurisdiction}
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 max-w-4xl text-xs leading-5 text-muted-foreground">
          {grant.summary || verdict.copy}
        </p>
      </div>
      <FactCell label="Funding" value={amountLabel(grant)} />
      <FactCell
        label="Deadline"
        value={deadline.label}
        detail={deadline.detail}
        tone={deadline.tone}
      />
      <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
        <PrimaryGrantAction
          evaluating={evaluating}
          grant={grant}
          isAdmin={isAdmin}
          pending={pending}
          onDraft={onDraft}
          onEnrich={onEnrich}
          onEvaluate={onEvaluate}
        />
        {grant.url && (
          <Button asChild variant="ghost" size="icon" aria-label="Open official page">
            <a href={grant.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function LifecycleBoard({ grants }: { grants: GrantRowData[] }) {
  return (
    <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {PIPELINE_STAGES.map((stage) => {
        const items = grants.filter((grant) => stage.statuses.includes(grant.status));
        return <StagePanel key={stage.key} items={items} stage={stage} />;
      })}
    </section>
  );
}

function StagePanel({
  items,
  stage,
}: {
  items: GrantRowData[];
  stage: (typeof PIPELINE_STAGES)[number];
}) {
  const Icon = stage.icon;
  const shown = items.slice(0, 5);
  return (
    <section className="rounded-md border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{stage.label}</h3>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{stage.description}</p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-md tabular-nums">
          {items.length}
        </Badge>
      </div>
      <div className="divide-y">
        {shown.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No records in this stage.</div>
        ) : (
          shown.map((grant) => <StageGrant key={grant.id} grant={grant} />)
        )}
      </div>
      {items.length > shown.length && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          +{items.length - shown.length} more in this stage
        </div>
      )}
    </section>
  );
}

function StageGrant({ grant }: { grant: GrantRowData }) {
  const deadline = deadlineState(grant.deadline);
  const fit = fitValue(grant);
  return (
    <Link
      to="/grants/$id"
      params={{ id: grant.id }}
      className="grid gap-2 px-4 py-3 transition-colors hover:bg-accent/45 sm:grid-cols-[minmax(0,1fr)_80px]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{grant.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {funderOf(grant)?.name ?? "Unknown funder"} / {deadline.label}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <span className="text-xl font-semibold tabular-nums">
          {fit == null ? "-" : Math.round(fit * 100)}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function ExceptionQueue({
  evaluatingIds,
  grants,
  isAdmin,
  pending,
  onEnrich,
  onEvaluate,
}: {
  evaluatingIds: Set<string>;
  grants: GrantRowData[];
  isAdmin: boolean;
  pending: string | null;
  onEnrich: (grantId: string) => void;
  onEvaluate: (grantId: string) => void;
}) {
  if (grants.length === 0) {
    return (
      <EmptyPanel
        icon={CheckCircle2}
        title="No exceptions in the current filter"
        body="The visible grant set has no urgent deadlines, duplicate clusters, or missing fit decisions."
      />
    );
  }

  return (
    <section className="grid gap-3 xl:grid-cols-2">
      {grants.map((grant) => (
        <RiskCard
          key={grant.id}
          grant={grant}
          isAdmin={isAdmin}
          pending={pending}
          evaluating={evaluatingIds.has(grant.id)}
          onEnrich={onEnrich}
          onEvaluate={onEvaluate}
        />
      ))}
    </section>
  );
}

function RiskCard({
  evaluating,
  grant,
  isAdmin,
  pending,
  onEnrich,
  onEvaluate,
}: {
  evaluating: boolean;
  grant: GrantRowData;
  isAdmin: boolean;
  pending: string | null;
  onEnrich: (grantId: string) => void;
  onEvaluate: (grantId: string) => void;
}) {
  const risks = riskReasons(grant);
  return (
    <section className="rounded-md border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/grants/$id"
            params={{ id: grant.id }}
            className="text-sm font-semibold hover:text-primary hover:underline"
          >
            {grant.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {funderOf(grant)?.name ?? "Unknown funder"}
          </p>
        </div>
        <Badge variant="outline" className="rounded-md text-amber-700">
          {risks.length} signal{risks.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <ul className="mt-4 space-y-2">
        {risks.map((risk) => (
          <li key={risk} className="flex gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span className="leading-6 text-muted-foreground">{risk}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <PrimaryGrantAction
          evaluating={evaluating}
          grant={grant}
          isAdmin={isAdmin}
          pending={pending}
          compact
          onDraft={() => undefined}
          onEnrich={onEnrich}
          onEvaluate={onEvaluate}
        />
        <Button asChild variant="outline" size="sm">
          <Link to="/grants/$id" params={{ id: grant.id }}>
            Open file
          </Link>
        </Button>
      </div>
    </section>
  );
}

function PrimaryGrantAction({
  compact = false,
  evaluating,
  grant,
  isAdmin,
  pending,
  onDraft,
  onEnrich,
  onEvaluate,
}: {
  compact?: boolean;
  evaluating: boolean;
  grant: GrantRowData;
  isAdmin: boolean;
  pending: string | null;
  onDraft: (grantId: string) => void;
  onEnrich: (grantId: string) => void;
  onEvaluate: (grantId: string) => void;
}) {
  const size = compact ? "sm" : "sm";
  const className = compact ? "" : "min-w-32";

  if (grant.status === "discovered") {
    if (!isAdmin) {
      return (
        <Button asChild variant="outline" size={size} className={className}>
          <Link to="/grants/$id" params={{ id: grant.id }}>
            Review
          </Link>
        </Button>
      );
    }
    return (
      <Button
        size={size}
        variant="outline"
        className={className}
        disabled={pending === `${grant.id}:enrich`}
        onClick={() => onEnrich(grant.id)}
      >
        {pending === `${grant.id}:enrich` ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Fetch details
      </Button>
    );
  }

  if (!grant.evaluation || grant.status === "enriched") {
    return (
      <Button
        size={size}
        className={className}
        disabled={pending === grant.id || evaluating}
        onClick={() => onEvaluate(grant.id)}
      >
        {evaluating || pending === grant.id ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <SearchCheck className="h-4 w-4" />
        )}
        Check fit
      </Button>
    );
  }

  if (["scored", "shortlisted"].includes(grant.status)) {
    return (
      <Button
        size={size}
        className={className}
        disabled={pending === `${grant.id}:draft`}
        onClick={() => onDraft(grant.id)}
      >
        {pending === `${grant.id}:draft` ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Draft
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size={size} className={className}>
      <Link to="/grants/$id" params={{ id: grant.id }}>
        Open
      </Link>
    </Button>
  );
}

function HeroMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-md border bg-background/70 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone?: "neutral" | "success" | "warning";
  value: number | string;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-primary";
  return (
    <section className="rounded-md border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("mt-3 text-3xl font-semibold leading-none tabular-nums", toneClass)}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DarkMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.06] p-3">
      <div className="text-white/42">{label}</div>
      <div className="mt-1 font-semibold text-white">{value}</div>
    </div>
  );
}

function PriorityBadge({ fit, grant }: { fit: number | null; grant: GrantRowData }) {
  const pct = fit == null ? null : Math.round(fit * 100);
  const deadline = deadlineState(grant.deadline);
  const tone =
    grant.evaluation?.eligibility_pass && (fit ?? 0) >= 0.7
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700"
      : deadline.tone === "danger"
        ? "border-rose-500/35 bg-rose-500/10 text-rose-700"
        : fit == null
          ? "border-dashed bg-muted/30 text-muted-foreground"
          : "border-amber-500/35 bg-amber-500/10 text-amber-700";
  return (
    <div className={cn("w-20 rounded-md border px-2 py-2 text-center", tone)}>
      <div className="text-2xl font-semibold leading-none tabular-nums">
        {pct == null ? "-" : pct}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-normal">
        {pct == null ? "fit" : "match"}
      </div>
    </div>
  );
}

function FactCell({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail?: string;
  label: string;
  tone?: "danger" | "neutral" | "warning";
  value: string;
}) {
  const toneClass =
    tone === "danger" ? "text-rose-600" : tone === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground lg:hidden">
        {label}
      </div>
      <div className={cn("text-sm font-medium leading-5 tabular-nums", toneClass)}>{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function EmptyPanel({
  body,
  icon: Icon,
  title,
}: {
  body: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="rounded-md border border-dashed bg-card px-5 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
    </section>
  );
}

function funderOf(grant: GrantRowData) {
  return Array.isArray(grant.funder) ? (grant.funder[0] ?? null) : grant.funder;
}

function fitValue(grant: GrantRowData): number | null {
  return grant.evaluation?.fit_score ?? grant.fit_score ?? null;
}

function priorityScore(grant: GrantRowData): number {
  const fit = fitValue(grant) ?? 0;
  const deadline = deadlineState(grant.deadline);
  const eligible = grant.evaluation?.eligibility_pass ? 40 : 0;
  const urgency =
    deadline.days == null
      ? 0
      : deadline.days < 0
        ? -50
        : deadline.days <= 7
          ? 30
          : deadline.days <= 30
            ? 18
            : 0;
  const workflow = ["scored", "shortlisted", "in_proposal"].includes(grant.status) ? 12 : 0;
  return fit * 100 + eligible + urgency + workflow;
}

function verdictFor(grant: GrantRowData): { copy: string } {
  const fit = fitValue(grant);
  const deadline = deadlineState(grant.deadline);
  if (deadline.days != null && deadline.days < 0) {
    return { copy: "Deadline has passed; keep for history unless the funder reopened intake." };
  }
  if (grant.status === "discovered") {
    return { copy: "Source detected. Fetch details before making a pursue decision." };
  }
  if (!grant.evaluation) {
    return { copy: "Details are present. Run a fit check to get eligibility and match reasoning." };
  }
  if (grant.evaluation.eligibility_pass && (fit ?? 0) >= 0.7) {
    return {
      copy: "Strong fit and no eligibility blocker. This should be reviewed for proposal work.",
    };
  }
  if (grant.evaluation.eligibility_pass) {
    return {
      copy: "Eligible, but proposal effort should depend on project alignment and deadline runway.",
    };
  }
  return { copy: "Eligibility risk found. Resolve the blocker before drafting." };
}

function nextFocusCopy(grant: GrantRowData): string {
  const fit = fitValue(grant);
  const deadline = deadlineState(grant.deadline);
  if (grant.status === "discovered") return "Verify the source and extract structured facts first.";
  if (!grant.evaluation)
    return "Run the evaluator so the record has a defensible pursue/no-pursue signal.";
  if (deadline.days != null && deadline.days >= 0 && deadline.days <= 14) {
    return `Deadline pressure is high: ${deadline.label.toLowerCase()}.`;
  }
  if (grant.evaluation.eligibility_pass && (fit ?? 0) >= 0.7) {
    return "Highest ranked eligible match in the current workspace.";
  }
  return "Open the decision file to review fit rationale, requirements, and source health.";
}

function deadlineState(deadline: string | null): {
  days: number | null;
  detail?: string;
  label: string;
  tone: "danger" | "neutral" | "warning";
} {
  if (!deadline) return { days: null, label: "Rolling / unknown", tone: "neutral" };
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return { days: null, detail: deadline, label: "Unparsed", tone: "warning" };
  }
  const days = Math.ceil((date.getTime() - Date.now()) / DAY_MS);
  const detail = date.toLocaleDateString("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (days < 0) return { days, detail, label: "Closed", tone: "danger" };
  if (days === 0) return { days, detail, label: "Closes today", tone: "danger" };
  if (days <= 7) return { days, detail, label: `${days} days left`, tone: "danger" };
  if (days <= 30) return { days, detail, label: `${days} days left`, tone: "warning" };
  return { days, detail, label: detail, tone: "neutral" };
}

function amountLabel(grant: GrantRowData): string {
  const min = grant.amount_cad_min;
  const max = grant.amount_cad_max;
  if (min != null && max != null)
    return min === max ? formatCad(max) : `${formatCad(min)} to ${formatCad(max)}`;
  if (max != null) return `Up to ${formatCad(max)}`;
  if (min != null) return `From ${formatCad(min)}`;
  return "Not published";
}

function formatCad(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatCompactCad(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return formatCad(value);
}

function collectJurisdictions(grants: GrantRowData[]): string[] {
  return Array.from(
    new Set(
      grants
        .map((grant) => funderOf(grant)?.jurisdiction ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
}

function hasOperationalRisk(grant: GrantRowData): boolean {
  return riskReasons(grant).length > 0;
}

function riskReasons(grant: GrantRowData): string[] {
  const reasons: string[] = [];
  const deadline = deadlineState(grant.deadline);
  if (deadline.days != null && deadline.days >= 0 && deadline.days <= 14) {
    reasons.push(`Deadline pressure: ${deadline.label}.`);
  }
  if (
    deadline.days != null &&
    deadline.days < 0 &&
    !["expired", "archived", "lost"].includes(grant.status)
  ) {
    reasons.push("Deadline appears closed but the record is still active.");
  }
  if (!grant.evaluation && grant.status !== "discovered") {
    reasons.push("Verified record has no fit evaluation yet.");
  }
  if (grant.status === "discovered") {
    reasons.push("Source lead still needs structured enrichment.");
  }
  if ((grant.duplicateGroupSize ?? 1) > 1) {
    reasons.push("Similar active records may split evidence or duplicate work.");
  }
  if (grant.evaluation && !grant.evaluation.eligibility_pass) {
    reasons.push("Evaluator flagged an eligibility blocker.");
  }
  return reasons;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
