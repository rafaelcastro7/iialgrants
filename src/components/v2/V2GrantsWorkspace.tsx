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
  Landmark,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
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

// -----------------------------------------------------------------------------
// Friendly redesign of the Grant Radar workspace.
//
// Same props contract as before — this is a drop-in for the file the
// /grants route already renders. The redesign is about CLARITY:
//   • plain language everywhere ("You can apply", "Closes in 5 days")
//   • ONE consolidated KPI strip (no duplicated hero + metric-card rows)
//   • a single, prominent "Do this next" recommendation
//   • a scannable decision queue: fit ring + friendly match label + one action
// The Board and Exceptions views are preserved for power users.
// -----------------------------------------------------------------------------

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

const PIPELINE_STAGES: Array<{
  description: string;
  icon: LucideIcon;
  key: string;
  label: string;
  statuses: string[];
}> = [
  { description: "Fresh leads that still need a source check.", icon: Search, key: "discover", label: "New leads", statuses: ["discovered"] },
  { description: "Facts and fit checks are being put together.", icon: ShieldCheck, key: "qualify", label: "Checking", statuses: ["enriched", "scored"] },
  { description: "Worth spending application time on.", icon: FileText, key: "pursue", label: "Pursuing", statuses: ["shortlisted", "in_proposal"] },
  { description: "Sent, waiting to hear back.", icon: Send, key: "submit", label: "Submitted", statuses: ["submitted"] },
  { description: "Wins to manage for reporting and renewal.", icon: CheckCircle2, key: "award", label: "Won", statuses: ["won"] },
  { description: "Closed, expired, or set aside.", icon: XCircle, key: "close", label: "Closed", statuses: ["lost", "expired", "archived"] },
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

  const activeAll = useMemo(() => allGrants.filter((g) => isActiveGrantStatus(g.status)), [allGrants]);
  const activeFiltered = useMemo(
    () => filteredGrants.filter((g) => isActiveGrantStatus(g.status)),
    [filteredGrants],
  );

  const metrics = useMemo(() => {
    const eligible = activeAll.filter((g) => g.evaluation?.eligibility_pass);
    const scored = activeAll.filter((g) => g.evaluation);
    const urgent = activeAll.filter((g) => {
      const d = deadlineState(g.deadline);
      return d.days != null && d.days >= 0 && d.days <= 30;
    });
    const proposalReady = activeAll.filter((g) =>
      ["scored", "shortlisted", "in_proposal"].includes(g.status),
    );
    const value = eligible.reduce((s, g) => s + (g.amount_cad_max ?? g.amount_cad_min ?? 0), 0);
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

  const nextFocus = queue.find((g) => !["submitted", "won"].includes(g.status)) ?? queue[0];
  const riskItems = useMemo(() => activeFiltered.filter(hasOperationalRisk), [activeFiltered]);
  const jurisdictions = useMemo(() => collectJurisdictions(allGrants), [allGrants]);

  return (
    <section className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header + primary actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[32px]">
            Here&rsquo;s where to focus today
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            We checked{" "}
            <span className="font-semibold text-foreground">{metrics.total} grants</span> against
            your organization. They&rsquo;re sorted so the best use of your time is right at the top.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/fit-rules">
              <ClipboardList className="h-4 w-4" />
              What we show you
            </Link>
          </Button>
          {isAdmin && (
            <Button className="gap-2" disabled={pending === "__discover__"} onClick={onDiscoverAll}>
              {pending === "__discover__" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Find new grants
            </Button>
          )}
        </div>
      </div>

      {/* Do this next */}
      {nextFocus && <NextBestAction grant={nextFocus} />}

      {/* One consolidated KPI strip */}
      <div>
        <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          At a glance
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard icon={SearchCheck} label="Grants in view" value={metrics.total} help="Active opportunities for you" accent="primary" />
          <KpiCard icon={ShieldCheck} label="You can apply" value={metrics.eligible} help="You meet the eligibility rules" accent="success" />
          <KpiCard icon={CalendarClock} label="Closing soon" value={metrics.urgent} help="Deadline within 30 days" accent="danger" />
          <KpiCard icon={FileText} label="Ready to draft" value={metrics.proposalReady} help={metrics.value ? `${formatCompactCad(metrics.value)} in eligible funding` : "Scored or shortlisted"} accent="violet" />
          <KpiCard icon={AlertTriangle} label="Need a look" value={metrics.exceptions} help="Missing info or a blocker" accent={metrics.exceptions > 0 ? "warning" : "neutral"} />
        </div>
      </div>

      {activeJob && (
        <DiscoveryProgress jobId={activeJob.jobId} queued={activeJob.queued} fr={false} onClose={onCloseJob} />
      )}

      <StatusMessages
        autoMsg={autoMsg}
        discoveryMsg={discoveryMsg}
        error={error}
        onClearAutoMsg={onClearAutoMsg}
        onClearDiscoveryMsg={onClearDiscoveryMsg}
        onClearError={onClearError}
      />

      {/* Search + view switch */}
      <FilterBar
        eligibleOnly={eligibleOnly}
        filteredCount={activeFiltered.length}
        jurisdiction={jurisdiction}
        jurisdictions={jurisdictions}
        onlyWithDeadline={onlyWithDeadline}
        search={search}
        sortKey={sortKey}
        tab={tab}
        totalCount={activeAll.length}
        onEligibleOnlyChange={onEligibleOnlyChange}
        onJurisdictionChange={onJurisdictionChange}
        onOnlyWithDeadlineChange={onOnlyWithDeadlineChange}
        onSearchChange={onSearchChange}
        onSortKeyChange={onSortKeyChange}
        onTabChange={setTab}
      />

      <Tabs value={tab} onValueChange={setTab}>
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
        <TabsContent value="board" className="mt-0">
          <LifecycleBoard grants={activeFiltered} />
        </TabsContent>
        <TabsContent value="exceptions" className="mt-0">
          <ExceptionQueue
            evaluatingIds={evaluatingIds}
            grants={riskItems}
            isAdmin={isAdmin}
            pending={pending}
            onDraft={onDraft}
            onEnrich={onEnrich}
            onEvaluate={onEvaluate}
          />
        </TabsContent>
      </Tabs>

      {/* New-here helper */}
      <div className="flex items-center gap-4 rounded-lg border border-primary/20 bg-accent/50 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            New here? The match score just means &ldquo;how well this grant fits you.&rdquo;
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Green is a strong fit, amber is worth a look. We only show grants you could realistically win.
          </div>
        </div>
        <Button asChild variant="outline" className="hidden shrink-0 sm:inline-flex">
          <Link to="/manual">See how it works</Link>
        </Button>
      </div>

      {allGrants.length === 0 && (
        <section className="rounded-lg border border-dashed bg-card px-5 py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border bg-muted">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="mt-3 text-base font-semibold">No grants yet</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
            Discovery scans your enabled funders and adds source-linked grants to review.
          </p>
          {isAdmin ? (
            <Button className="mt-4 gap-2" disabled={pending === "__discover__"} onClick={onDiscoverAll}>
              {pending === "__discover__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Find new grants
            </Button>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">Ask an admin to run discovery.</p>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <div className="mr-auto flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-4 w-4 text-primary" />
              Local tools
            </div>
            <NotebookLMBridge />
            <FunderSelector fr={false} selected={selectedFunders} onChange={onSelectedFundersChange} />
            <Button size="sm" className="gap-2" disabled={pending === "__discover__"} onClick={onDiscoverAll}>
              {pending === "__discover__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Discover
            </Button>
          </div>
          <div className="rounded-lg border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="text-base font-semibold">Discovery activity</h2>
              <p className="text-sm text-muted-foreground">Recent crawler and agent runs.</p>
            </div>
            <div className="p-4">
              <EventLog fr={false} />
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Do this next
// -----------------------------------------------------------------------------

function NextBestAction({ grant }: { grant: GrantRowData }) {
  const deadline = deadlineState(grant.deadline);
  const fit = fitValue(grant);
  const funder = funderOf(grant);
  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary/85 px-6 py-5 text-primary-foreground sm:flex-row sm:items-center sm:gap-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-brand/20" />
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
        <Sparkles className="h-7 w-7" />
      </div>
      <div className="z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand">
          <Zap className="h-3.5 w-3.5" />
          Do this next
        </div>
        <div className="mt-1.5 text-lg font-semibold leading-snug">{nextFocusHeadline(grant)}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-primary-foreground/70">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {deadline.days != null && deadline.days >= 0 ? `${deadline.days} days runway` : deadline.label}
          </span>
          {funder?.name && (
            <span className="inline-flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5" />
              {funder.name}
            </span>
          )}
          {fit != null && (
            <span className="inline-flex items-center gap-1.5">
              <SearchCheck className="h-3.5 w-3.5" />
              {Math.round(fit * 100)}% fit
            </span>
          )}
        </div>
      </div>
      <Button asChild variant="secondary" className="z-10 shrink-0 gap-2 bg-white text-primary hover:bg-white/90">
        <Link to="/grants/$id" params={{ id: grant.id }}>
          Open this grant
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// KPI card
// -----------------------------------------------------------------------------

type Accent = "primary" | "success" | "danger" | "warning" | "violet" | "neutral";
const ACCENT_TEXT: Record<Accent, string> = {
  primary: "text-primary",
  success: "text-emerald-600",
  danger: "text-rose-600",
  warning: "text-amber-600",
  violet: "text-violet-600",
  neutral: "text-foreground",
};
const ACCENT_BAR: Record<Accent, string> = {
  primary: "bg-primary",
  success: "bg-emerald-500",
  danger: "bg-rose-500",
  warning: "bg-amber-500",
  violet: "bg-violet-500",
  neutral: "bg-muted-foreground",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  help,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  help: string;
  accent: Accent;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4">
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", ACCENT_BAR[accent])} />
      <div className="flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60", ACCENT_TEXT[accent])}>
          <Icon className="h-4 w-4" />
        </span>
        <span className={cn("text-2xl font-semibold tabular-nums", ACCENT_TEXT[accent])}>{value}</span>
      </div>
      <div className="mt-2.5 text-sm font-semibold">{label}</div>
      <div className="mt-0.5 text-xs leading-4 text-muted-foreground">{help}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Filter / view bar
// -----------------------------------------------------------------------------

function FilterBar({
  eligibleOnly,
  filteredCount,
  jurisdiction,
  jurisdictions,
  onlyWithDeadline,
  search,
  sortKey,
  tab,
  totalCount,
  onEligibleOnlyChange,
  onJurisdictionChange,
  onOnlyWithDeadlineChange,
  onSearchChange,
  onSortKeyChange,
  onTabChange,
}: {
  eligibleOnly: boolean;
  filteredCount: number;
  jurisdiction: string;
  jurisdictions: string[];
  onlyWithDeadline: boolean;
  search: string;
  sortKey: SortKey;
  tab: string;
  totalCount: number;
  onEligibleOnlyChange: (next: boolean) => void;
  onJurisdictionChange: (next: string) => void;
  onOnlyWithDeadlineChange: (next: boolean) => void;
  onSearchChange: (next: string) => void;
  onSortKeyChange: (next: SortKey) => void;
  onTabChange: (next: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by grant name or funder…"
            aria-label="Search grants"
            className="pl-9"
          />
        </div>
        <Select value={sortKey} onValueChange={(v) => onSortKeyChange(v as SortKey)}>
          <SelectTrigger className="w-[190px]" aria-label="Sort grants">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {key === "fit" ? "Best matches first" : SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jurisdiction} onValueChange={onJurisdictionChange}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by jurisdiction">
            <SelectValue placeholder="Where" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anywhere</SelectItem>
            {jurisdictions.map((j) => (
              <SelectItem key={j} value={j}>
                {j}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={eligibleOnly ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          aria-pressed={eligibleOnly}
          onClick={() => onEligibleOnlyChange(!eligibleOnly)}
        >
          <CheckCircle2 className="h-4 w-4" />
          I can apply
        </Button>
        <Button
          type="button"
          variant={onlyWithDeadline ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          aria-pressed={onlyWithDeadline}
          onClick={() => onOnlyWithDeadlineChange(!onlyWithDeadline)}
        >
          <CalendarClock className="h-4 w-4" />
          Has a deadline
        </Button>
        <TabsList className="ml-auto h-10" >
          <button type="button" onClick={() => onTabChange("queue")} className={tabCls(tab === "queue")}>
            List
          </button>
          <button type="button" onClick={() => onTabChange("board")} className={tabCls(tab === "board")}>
            Board
          </button>
          <button type="button" onClick={() => onTabChange("exceptions")} className={tabCls(tab === "exceptions")}>
            Needs a look
          </button>
        </TabsList>
      </div>
      <div className="text-xs text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{filteredCount}</span> of{" "}
        <span className="font-semibold text-foreground">{totalCount}</span> active grants
      </div>
    </div>
  );
}

function tabCls(active: boolean) {
  return cn(
    "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
}

// -----------------------------------------------------------------------------
// Decision queue (friendly cards)
// -----------------------------------------------------------------------------

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
        title="No grants match this view"
        body="Try clearing a filter, or run discovery to add more."
      />
    );
  }
  return (
    <div className="space-y-3">
      {grants.map((grant) => (
        <QueueCard
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
  );
}

function QueueCard({
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
  const funder = funderOf(grant);
  const elig = eligibilityChip(grant);

  return (
    <div className="flex items-center gap-5 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex w-[88px] shrink-0 flex-col items-center gap-1.5">
        <FitRing fit={fit} />
        <span className={cn("text-center text-[11px] font-semibold", matchTextClass(fit))}>
          {matchLabel(fit)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/grants/$id"
            params={{ id: grant.id }}
            className="text-base font-semibold leading-snug hover:text-primary hover:underline"
            title={grant.title}
          >
            {grant.title}
          </Link>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", elig.cls)}>
            {elig.icon}
            {elig.label}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5" />
            {funder?.name ?? "Unknown funder"}
          </span>
          {funder?.jurisdiction && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {funder.jurisdiction}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">{amountLabel(grant)}</span>
          <span className={cn("inline-flex items-center gap-1.5 font-semibold", deadlineTextClass(deadline.tone))}>
            <CalendarClock className="h-3.5 w-3.5" />
            {friendlyDeadline(deadline)}
          </span>
        </div>
        <p className="mt-2.5 line-clamp-2 max-w-3xl text-[13px] leading-5 text-foreground/80">
          {plainGuidance(grant)}
        </p>
      </div>

      <div className="flex w-[180px] shrink-0 flex-col items-stretch gap-2">
        <PrimaryGrantAction
          evaluating={evaluating}
          grant={grant}
          isAdmin={isAdmin}
          pending={pending}
          onDraft={onDraft}
          onEnrich={onEnrich}
          onEvaluate={onEvaluate}
        />
        <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
          <Link to="/grants/$id" params={{ id: grant.id }}>
            Open full details
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function FitRing({ fit }: { fit: number | null }) {
  const pct = fit == null ? null : Math.round(fit * 100);
  const C = 2 * Math.PI * 16;
  const dash = pct == null ? 0 : (pct / 100) * C;
  const stroke =
    pct == null ? "var(--muted-foreground)" : pct >= 85 ? "#16a34a" : pct >= 70 ? "var(--primary)" : "#d97706";
  return (
    <div className="relative h-[60px] w-[60px]">
      <svg width="60" height="60" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="16" fill="none" stroke="var(--muted)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="16"
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-base font-bold tabular-nums">
        {pct == null ? "—" : pct}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Board + Exceptions (kept for power users)
// -----------------------------------------------------------------------------

function LifecycleBoard({ grants }: { grants: GrantRowData[] }) {
  return (
    <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {PIPELINE_STAGES.map((stage) => {
        const items = grants.filter((g) => stage.statuses.includes(g.status));
        return <StagePanel key={stage.key} items={items} stage={stage} />;
      })}
    </section>
  );
}

function StagePanel({ items, stage }: { items: GrantRowData[]; stage: (typeof PIPELINE_STAGES)[number] }) {
  const Icon = stage.icon;
  const shown = items.slice(0, 5);
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background text-primary">
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
          <div className="px-4 py-6 text-sm text-muted-foreground">Nothing here right now.</div>
        ) : (
          shown.map((grant) => <StageGrant key={grant.id} grant={grant} />)
        )}
      </div>
      {items.length > shown.length && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          +{items.length - shown.length} more
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
      className="grid gap-2 px-4 py-3 transition-colors hover:bg-accent/45 sm:grid-cols-[minmax(0,1fr)_72px]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{grant.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {funderOf(grant)?.name ?? "Unknown funder"} · {friendlyDeadline(deadline)}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <span className="text-xl font-semibold tabular-nums">{fit == null ? "—" : Math.round(fit * 100)}</span>
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
        icon={CheckCircle2}
        title="Nothing needs a look right now"
        body="No urgent deadlines, duplicates, or missing fit checks in this view."
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
          onDraft={onDraft}
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
  const risks = riskReasons(grant);
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/grants/$id" params={{ id: grant.id }} className="text-sm font-semibold hover:text-primary hover:underline">
            {grant.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted-foreground">{funderOf(grant)?.name ?? "Unknown funder"}</p>
        </div>
        <Badge variant="outline" className="rounded-md text-amber-700">
          {risks.length} to check
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
          onDraft={onDraft}
          onEnrich={onEnrich}
          onEvaluate={onEvaluate}
        />
        <Button asChild variant="outline" size="sm">
          <Link to="/grants/$id" params={{ id: grant.id }}>
            Open
          </Link>
        </Button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Primary action — plain verbs
// -----------------------------------------------------------------------------

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
  const cls = compact ? "" : "w-full";

  if (grant.status === "discovered") {
    if (!isAdmin) {
      return (
        <Button asChild variant="outline" size="sm" className={cls}>
          <Link to="/grants/$id" params={{ id: grant.id }}>
            Take a look
          </Link>
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant="outline"
        className={cn(cls, "gap-2")}
        disabled={pending === `${grant.id}:enrich`}
        onClick={() => onEnrich(grant.id)}
      >
        {pending === `${grant.id}:enrich` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Get the details
      </Button>
    );
  }

  if (!grant.evaluation || grant.status === "enriched") {
    return (
      <Button
        size="sm"
        className={cn(cls, "gap-2")}
        disabled={pending === grant.id || evaluating}
        onClick={() => onEvaluate(grant.id)}
      >
        {evaluating || pending === grant.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
        Check the fit
      </Button>
    );
  }

  if (!grant.evaluation.eligibility_pass) {
    return (
      <Button asChild variant="outline" size="sm" className={cls}>
        <Link to="/grants/$id" params={{ id: grant.id }}>
          Take a closer look
        </Link>
      </Button>
    );
  }

  if (["scored", "shortlisted"].includes(grant.status)) {
    return (
      <Button
        size="sm"
        className={cn(cls, "gap-2")}
        disabled={pending === `${grant.id}:draft`}
        onClick={() => onDraft(grant.id)}
      >
        {pending === `${grant.id}:draft` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Draft application
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm" className={cls}>
      <Link to="/grants/$id" params={{ id: grant.id }}>
        Open
      </Link>
    </Button>
  );
}

// -----------------------------------------------------------------------------
// Messages + empty panel
// -----------------------------------------------------------------------------

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

function Message({ children, onClear, tone = "neutral" }: { children: ReactNode; onClear: () => void; tone?: "danger" | "neutral" }) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "danger" ? "border-destructive/35 bg-destructive/5 text-destructive" : "bg-card text-muted-foreground",
      )}
    >
      <p className="min-w-0 break-words">{children}</p>
      <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onClear} aria-label="Dismiss">
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

function EmptyPanel({ body, icon: Icon, title }: { body: string; icon: LucideIcon; title: string }) {
  return (
    <section className="rounded-lg border border-dashed bg-card px-5 py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function funderOf(grant: GrantRowData) {
  return Array.isArray(grant.funder) ? (grant.funder[0] ?? null) : grant.funder;
}

function fitValue(grant: GrantRowData): number | null {
  return grant.evaluation?.fit_score ?? grant.fit_score ?? null;
}

function matchLabel(fit: number | null): string {
  if (fit == null) return "Not checked yet";
  const pct = fit * 100;
  if (pct >= 85) return "Great match";
  if (pct >= 70) return "Good match";
  return "Worth a look";
}

function matchTextClass(fit: number | null): string {
  if (fit == null) return "text-muted-foreground";
  const pct = fit * 100;
  if (pct >= 85) return "text-emerald-600";
  if (pct >= 70) return "text-primary";
  return "text-amber-600";
}

function eligibilityChip(grant: GrantRowData): { label: string; cls: string; icon: ReactNode } {
  if (grant.evaluation && !grant.evaluation.eligibility_pass) {
    return {
      label: "May not qualify",
      cls: "border-rose-500/30 bg-rose-500/10 text-rose-700",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  }
  if (grant.evaluation?.eligibility_pass) {
    return {
      label: "You can apply",
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
      icon: <CheckCircle2 className="h-3 w-3" />,
    };
  }
  return {
    label: grant.status === "discovered" ? "Needs a fetch" : "Not checked yet",
    cls: "border-border bg-muted/60 text-muted-foreground",
    icon: <SearchCheck className="h-3 w-3" />,
  };
}

function plainGuidance(grant: GrantRowData): string {
  if (grant.summary) return grant.summary;
  const fit = fitValue(grant);
  const deadline = deadlineState(grant.deadline);
  if (deadline.days != null && deadline.days < 0) return "The deadline has passed — keep for reference unless the funder reopens.";
  if (grant.status === "discovered") return "A new lead we just found. Pull the details so we can check amount, deadline, and eligibility.";
  if (!grant.evaluation) return "We have the facts but haven't scored the fit yet. Run a quick check to see if it's worth pursuing.";
  if (grant.evaluation.eligibility_pass && (fit ?? 0) >= 0.7) return "You can apply and it's a good fit — a strong candidate for a proposal.";
  if (grant.evaluation.eligibility_pass) return "You're eligible; whether to apply depends on the project angle and how much time you have.";
  return "Heads up: there may be an eligibility blocker. Confirm it before spending time here.";
}

function nextFocusHeadline(grant: GrantRowData): string {
  const deadline = deadlineState(grant.deadline);
  if (grant.status === "discovered") return `Get the details for "${grant.title}"`;
  if (!grant.evaluation) return `Check the fit for "${grant.title}"`;
  if (deadline.days != null && deadline.days >= 0 && deadline.days <= 14)
    return `Start your application for "${grant.title}" — it closes soon`;
  return `Review "${grant.title}" for a proposal`;
}

function deadlineState(deadline: string | null): {
  days: number | null;
  label: string;
  tone: "danger" | "neutral" | "warning";
} {
  if (!deadline) return { days: null, label: "No deadline (rolling)", tone: "neutral" };
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return { days: null, label: "Deadline unclear", tone: "warning" };
  const days = Math.ceil((date.getTime() - Date.now()) / DAY_MS);
  if (days < 0) return { days, label: "Closed", tone: "danger" };
  if (days === 0) return { days, label: "Closes today", tone: "danger" };
  if (days <= 7) return { days, label: `${days} days left`, tone: "danger" };
  if (days <= 30) return { days, label: `${days} days left`, tone: "warning" };
  return {
    days,
    label: date.toLocaleDateString("en-CA", { day: "numeric", month: "short", year: "numeric" }),
    tone: "neutral",
  };
}

function friendlyDeadline(d: ReturnType<typeof deadlineState>): string {
  if (d.days == null) return d.label;
  if (d.days < 0) return "Closed";
  if (d.days === 0) return "Closes today";
  return `Closes in ${d.days} days`;
}

function deadlineTextClass(tone: "danger" | "neutral" | "warning"): string {
  return tone === "danger" ? "text-rose-600" : tone === "warning" ? "text-amber-600" : "text-muted-foreground";
}

function amountLabel(grant: GrantRowData): string {
  const min = grant.amount_cad_min;
  const max = grant.amount_cad_max;
  if (min != null && max != null) return min === max ? formatCad(max) : `${formatCad(min)} – ${formatCad(max)}`;
  if (max != null) return `Up to ${formatCad(max)}`;
  if (min != null) return `From ${formatCad(min)}`;
  return "Amount not listed";
}

function formatCad(value: number): string {
  return new Intl.NumberFormat("en-CA", { currency: "CAD", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatCompactCad(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return formatCad(value);
}

function collectJurisdictions(grants: GrantRowData[]): string[] {
  return Array.from(
    new Set(grants.map((g) => funderOf(g)?.jurisdiction ?? null).filter((v): v is string => Boolean(v))),
  ).sort();
}

function priorityScore(grant: GrantRowData): number {
  const fit = fitValue(grant) ?? 0;
  const deadline = deadlineState(grant.deadline);
  const eligible = grant.evaluation?.eligibility_pass ? 40 : 0;
  const urgency =
    deadline.days == null ? 0 : deadline.days < 0 ? -50 : deadline.days <= 7 ? 30 : deadline.days <= 30 ? 18 : 0;
  const workflow = ["scored", "shortlisted", "in_proposal"].includes(grant.status) ? 12 : 0;
  return fit * 100 + eligible + urgency + workflow;
}

function hasOperationalRisk(grant: GrantRowData): boolean {
  return riskReasons(grant).length > 0;
}

function riskReasons(grant: GrantRowData): string[] {
  const reasons: string[] = [];
  const deadline = deadlineState(grant.deadline);
  if (deadline.days != null && deadline.days >= 0 && deadline.days <= 14) reasons.push(`Deadline is close: ${friendlyDeadline(deadline).toLowerCase()}.`);
  if (deadline.days != null && deadline.days < 0 && !["expired", "archived", "lost"].includes(grant.status))
    reasons.push("The deadline looks closed but this is still active.");
  if (!grant.evaluation && grant.status !== "discovered") reasons.push("Verified but not fit-checked yet.");
  if (grant.status === "discovered") reasons.push("New lead — still needs its details fetched.");
  if ((grant.duplicateGroupSize ?? 1) > 1) reasons.push("Similar records may split your evidence or duplicate work.");
  if (grant.evaluation && !grant.evaluation.eligibility_pass) reasons.push("Possible eligibility blocker to confirm.");
  return reasons;
}
