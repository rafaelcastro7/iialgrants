import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getOrgProfile } from "@/lib/org.functions";
import { listGrants } from "@/lib/grants.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { syncClientLocale } from "@/i18n/sync";
import { AppTopBar } from "@/components/AppSidebar";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PageTransition } from "@/components/PageTransition";
import { useUiVersion } from "@/components/v2/ui-version";
import {
  Activity,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ShieldCheck,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import "@/i18n";
import { isActiveGrantStatus } from "@/agents/pipeline-stages.shared";

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <AppTopBar />
      <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          <Skeleton className="h-[360px] rounded-xl" />
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard - IIAL" },
      { name: "description", content: "Your IIAL grant intelligence dashboard." },
    ],
  }),
  component: Dashboard,
  pendingComponent: DashboardSkeleton,
});

const DAY_MS = 86_400_000;

type NextStep =
  | {
      kind: "static";
      eyebrow: string;
      title: string;
      body: string;
      cta: string;
      to: "/org" | "/grants";
    }
  | { kind: "grant"; eyebrow: string; title: string; body: string; cta: string; id: string };

function Dashboard() {
  const { t } = useTranslation();
  const { version } = useUiVersion();
  const [email, setEmail] = useState<string | null>(null);

  const fetchOrg = useServerFn(getOrgProfile);
  const { data: org } = useQuery({ queryKey: ["org", "self"], queryFn: () => fetchOrg() });
  const fetchGrants = useServerFn(listGrants);
  const { data: grantData } = useQuery({
    queryKey: ["dashboard", "grants"],
    queryFn: () => fetchGrants({ data: { limit: 100 } }),
  });

  const p = org?.profile;
  const profileComplete = !!(p?.org_name && p.sectors?.length && p.jurisdictions?.length);
  const orgName = p?.org_name?.trim() || null;

  useEffect(() => {
    syncClientLocale();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const loading = grantData === undefined;
  const grants = (grantData?.grants ?? []).filter((g) => isActiveGrantStatus(g.status));
  const now = Date.now();

  const eligible = grants.filter((g) => g.evaluation?.eligibility_pass).length;
  const scored = grants.filter((g) => g.evaluation).length;
  const withDeadline = grants.filter((g) => !!g.deadline).length;
  const closingSoon = grants.filter((g) => {
    if (!g.deadline) return false;
    const d = (new Date(g.deadline).getTime() - now) / DAY_MS;
    return d >= 0 && d <= 30;
  }).length;
  const inPipeline = grants.filter((g) =>
    ["shortlisted", "in_proposal", "submitted", "won"].includes(g.status),
  ).length;
  // "Never enriched" (status still "discovered") looks identical to "checked,
  // nothing interesting" in a bare count — the enriched count disambiguates.
  const enrichedCount = grants.filter((g) => g.status !== "discovered").length;

  // Excludes submitted/won: those already have a decision in flight or made —
  // "review your top match" should point at something still worth acting on,
  // not a grant that's already past the point topMatches is nudging toward.
  const topMatches = [...grants]
    .filter((g) => g.evaluation && g.status !== "submitted" && g.status !== "won")
    .sort(
      (a, b) =>
        (b.evaluation!.eligibility_pass ? 1 : 0) - (a.evaluation!.eligibility_pass ? 1 : 0) ||
        b.evaluation!.fit_score - a.evaluation!.fit_score,
    )
    .slice(0, 5);

  // The single next action, phrased around the user's real situation.
  // `kind` discriminates a static-route CTA from the dynamic top-match one.
  const nextStep: NextStep = !profileComplete
    ? {
        kind: "static",
        eyebrow: "Set up",
        title: "Add your organization profile",
        body: "Sectors, jurisdictions, and budget let the system score grants against who you actually are — not generic defaults.",
        cta: "Complete profile",
        to: "/org",
      }
    : scored === 0
      ? {
          kind: "static",
          eyebrow: "Get started",
          title: "Check your fit on a grant",
          body: "Open Grants and run “Check my fit” to get an eligibility verdict and a match score for each opportunity.",
          cta: "Browse grants",
          to: "/grants",
        }
      : topMatches[0]
        ? {
            kind: "grant",
            eyebrow: "Recommended",
            title: `Review your top match: ${topMatches[0].title}`,
            body: "It has the highest fit for your organization. Open it to see the reasoning, requirements, and start a proposal.",
            cta: "Open top match",
            id: topMatches[0].id,
          }
        : {
            kind: "static",
            eyebrow: "Recommended",
            title: "Move a strong fit into a proposal",
            body: "You have scored grants. Draft a proposal from your best opportunity and track it to submission.",
            cta: "Browse grants",
            to: "/grants",
          };

  const greeting = orgName ? `Welcome back, ${orgName}` : "Welcome back";

  if (version === "v2") {
    return (
      <DashboardV2
        closingSoon={closingSoon}
        eligible={eligible}
        email={email}
        enrichedCount={enrichedCount}
        grantsCount={grants.length}
        greeting={greeting}
        inPipeline={inPipeline}
        loading={loading}
        nextStep={nextStep}
        now={now}
        scored={scored}
        topMatches={topMatches}
        withDeadline={withDeadline}
      />
    );
  }

  return (
    <PageTransition>
      <div className="relative min-h-screen overflow-hidden text-foreground">
        <AppTopBar title={t("nav.dashboard")} />

        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[-10rem] top-[-8rem] h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute right-[-12rem] top-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <section className="mx-auto max-w-7xl space-y-6 px-6 py-8 md:py-10">
          {/* Hero — compact, names the org and the job of the page */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              AI-native grant intelligence
            </p>
            <h1 className="mt-2 font-display text-4xl leading-[0.95] tracking-tight md:text-5xl">
              {greeting}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Your best-fit Canadian grant opportunities, scored against your organization and
              ranked so you always know what to work on next.
            </p>
          </div>

          {/* Situation — real pipeline numbers */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={Search}
              value={loading ? "—" : grants.length}
              label="Active opportunities"
              hint={loading ? "Live grants tracked" : `${enrichedCount} enriched so far`}
              to="/grants"
            />
            <StatTile
              icon={CheckCircle2}
              value={loading ? "—" : eligible}
              label="Eligible for you"
              hint={scored ? `${scored} checked so far` : "Run “Check my fit”"}
              tone="good"
              to="/grants"
            />
            <StatTile
              icon={CalendarClock}
              value={loading ? "—" : closingSoon}
              label="Closing soon"
              hint={
                loading
                  ? "Deadline within 30 days"
                  : withDeadline > 0
                    ? "Deadline within 30 days"
                    : `${withDeadline} of ${grants.length} have a known deadline`
              }
              tone={closingSoon > 0 ? "warn" : "neutral"}
              to="/grants"
            />
            <StatTile
              icon={FolderKanban}
              value={loading ? "—" : inPipeline}
              label="In your pipeline"
              hint="Shortlisted → submitted"
              to="/proposals"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
            {/* Top matches — the actual intelligence */}
            <Card className="border-border/70 bg-card/90 shadow-sm">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-2xl leading-none">Your top matches</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Highest fit for your organization, eligible first.
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="gap-1">
                    <Link to="/grants">
                      See all <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 rounded-xl" />
                    ))
                  ) : topMatches.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">
                      <p className="text-sm font-medium">No scored grants yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Open Grants and run “Check my fit” to rank opportunities for your
                        organization.
                      </p>
                      <Button asChild size="sm" className="mt-4 gap-2">
                        <Link to="/grants">
                          Browse grants <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    topMatches.map((g) => <MatchRow key={g.id} grant={g} now={now} />)
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Guidance + freshness */}
            <div className="space-y-6">
              <Card
                className={`border-border/70 shadow-sm ${
                  profileComplete ? "bg-card/90" : "border-amber-500/30 bg-amber-500/5"
                }`}
              >
                <CardContent className="p-5">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> {nextStep.eyebrow}
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug">{nextStep.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{nextStep.body}</p>
                  <Button asChild className="mt-4 w-full gap-2">
                    {nextStep.kind === "grant" ? (
                      <Link to="/grants/$id" params={{ id: nextStep.id }}>
                        {nextStep.cta} <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <Link to={nextStep.to}>
                        {nextStep.cta} <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <ActivityFeed />
            </div>
          </div>

          {email && <p className="text-xs text-muted-foreground">Signed in as {email}</p>}
        </section>
      </div>
    </PageTransition>
  );
}

type MatchGrant = {
  id: string;
  title: string;
  deadline: string | null;
  funder: { name: string } | { name: string }[] | null;
  evaluation: { fit_score: number; eligibility_pass: boolean } | null;
};

function DashboardV2({
  closingSoon,
  eligible,
  email,
  enrichedCount,
  grantsCount,
  greeting,
  inPipeline,
  loading,
  nextStep,
  now,
  scored,
  topMatches,
  withDeadline,
}: {
  closingSoon: number;
  eligible: number;
  email: string | null;
  enrichedCount: number;
  grantsCount: number;
  greeting: string;
  inPipeline: number;
  loading: boolean;
  nextStep: NextStep;
  now: number;
  scored: number;
  topMatches: MatchGrant[];
  withDeadline: number;
}) {
  const headlineGreeting = greeting.replace(/[.!?]+$/, "");

  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <section className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:py-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_360px]">
            <section className="overflow-hidden rounded-md border bg-card shadow-sm">
              <div className="grid min-h-[300px] lg:grid-cols-[minmax(0,1.35fr)_360px]">
                <div className="flex flex-col justify-between p-5 sm:p-6">
                  <div>
                    <Badge variant="outline" className="gap-2 rounded-md px-2.5 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                      Command center
                    </Badge>
                    <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
                      {headlineGreeting}. Run the grant operation from one place.
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                      Prioritize Canadian opportunities, see what needs action, and move strong
                      matches from discovery to reporting without switching tools.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-2 sm:grid-cols-3">
                    <V2PipelineCell icon={Search} label="Discover" value={`${grantsCount}`} />
                    <V2PipelineCell icon={CheckCircle2} label="Qualify" value={`${eligible}`} />
                    <V2PipelineCell icon={FolderKanban} label="Pursue" value={`${inPipeline}`} />
                  </div>
                </div>

                <aside className="border-t bg-muted/35 p-5 lg:border-l lg:border-t-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                        Next best action
                      </div>
                      <div className="mt-1 text-lg font-semibold leading-snug">
                        {nextStep.title}
                      </div>
                    </div>
                    <Sparkles className="h-5 w-5 shrink-0 text-brand" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{nextStep.body}</p>
                  <Button asChild className="mt-5 w-full gap-2">
                    {nextStep.kind === "grant" ? (
                      <Link to="/grants/$id" params={{ id: nextStep.id }}>
                        {nextStep.cta} <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <Link to={nextStep.to}>
                        {nextStep.cta} <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </Button>

                  <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border bg-card p-3">
                      <div className="text-muted-foreground">Scored</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums">{scored}</div>
                    </div>
                    <div className="rounded-md border bg-card p-3">
                      <div className="text-muted-foreground">Known deadlines</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums">{withDeadline}</div>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            <aside className="rounded-md border border-white/12 bg-[oklch(0.2_0.026_218)] p-5 text-white shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-teal-200" />
                Local intelligence posture
              </div>
              <p className="mt-3 text-sm leading-6 text-white/68">
                The workspace is designed around sovereign grant intelligence: local Supabase, local
                Ollama, auditable rules, and no cloud LLM spend.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                {[
                  ["AI", "Ollama"],
                  ["Database", "Supabase"],
                  ["Security", "RLS"],
                  ["Cost", "$0 tokens"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-md border border-white/10 bg-white/[0.06] p-3"
                  >
                    <div className="text-white/42">{label}</div>
                    <div className="mt-1 font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              {email && (
                <div className="mt-5 truncate text-xs text-white/42">Signed in as {email}</div>
              )}
            </aside>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <V2Metric
              icon={Search}
              label="Active opportunities"
              value={loading ? "-" : grantsCount}
              detail={loading ? "Loading grants" : `${enrichedCount} enriched`}
              to="/grants"
            />
            <V2Metric
              icon={ShieldCheck}
              label="Eligible"
              value={loading ? "-" : eligible}
              detail={scored ? `${scored} fit checks` : "Run fit checks"}
              tone="success"
              to="/grants"
            />
            <V2Metric
              icon={Clock3}
              label="Closing soon"
              value={loading ? "-" : closingSoon}
              detail="Deadline inside 30 days"
              tone={closingSoon > 0 ? "warning" : "neutral"}
              to="/grants"
            />
            <V2Metric
              icon={TrendingUp}
              label="Pipeline"
              value={loading ? "-" : inPipeline}
              detail="Shortlisted to awarded"
              to="/proposals"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
            <section className="rounded-md border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">Opportunity queue</h2>
                  <p className="text-sm text-muted-foreground">
                    Best matches first, with deadline pressure visible.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link to="/grants">
                    Open radar <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="divide-y">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="px-5 py-4">
                      <Skeleton className="h-14 rounded-md" />
                    </div>
                  ))
                ) : topMatches.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
                      <Activity className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-semibold">No scored grants yet</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                      Open the grant radar and run fit checks to build a ranked queue.
                    </p>
                  </div>
                ) : (
                  topMatches.map((grant) => <V2MatchRow key={grant.id} grant={grant} now={now} />)
                )}
              </div>
            </section>

            <section className="rounded-md border bg-card p-1 shadow-sm">
              <div className="border-b px-4 py-3">
                <h2 className="text-base font-semibold">Activity stream</h2>
                <p className="text-sm text-muted-foreground">Recent system and team movement.</p>
              </div>
              <ActivityFeed />
            </section>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

function V2PipelineCell({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
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

function V2Metric({
  detail,
  icon: Icon,
  label,
  tone = "neutral",
  to,
  value,
}: {
  detail: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone?: "success" | "warning" | "neutral";
  to: string;
  value: string | number;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-primary";

  return (
    <Link to={to} className="group block">
      <div className="rounded-md border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            {label}
          </div>
          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
        </div>
        <div className={`mt-3 text-3xl font-semibold leading-none tabular-nums ${toneClass}`}>
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </div>
    </Link>
  );
}

function V2MatchRow({ grant, now }: { grant: MatchGrant; now: number }) {
  const f = Array.isArray(grant.funder) ? grant.funder[0] : grant.funder;
  const fit = grant.evaluation ? Math.round(grant.evaluation.fit_score * 100) : null;
  const eligible = grant.evaluation?.eligibility_pass ?? false;
  const days = grant.deadline
    ? Math.ceil((new Date(grant.deadline).getTime() - now) / DAY_MS)
    : null;
  const deadlineLabel =
    days == null
      ? "Rolling deadline"
      : days < 0
        ? "Closed"
        : days === 0
          ? "Closes today"
          : `Closes in ${days} days`;

  return (
    <Link
      to="/grants/$id"
      params={{ id: grant.id }}
      className="grid gap-3 px-5 py-4 transition-colors hover:bg-accent/55 md:grid-cols-[minmax(0,1fr)_160px_88px]"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{grant.title}</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{f?.name ?? "Unknown funder"}</span>
          <span className="h-1 w-1 rounded-full bg-border" />
          <span className={days != null && days >= 0 && days <= 7 ? "text-rose-600" : ""}>
            {deadlineLabel}
          </span>
        </div>
      </div>
      <div className="flex items-center md:justify-end">
        <Badge
          variant="outline"
          className={cn(
            "rounded-md",
            eligible
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700"
              : "text-muted-foreground",
          )}
        >
          {eligible ? "Eligible" : "Needs fit check"}
        </Badge>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <div className="text-right">
          <div className="text-2xl font-semibold leading-none tabular-nums">
            {fit == null ? "-" : fit}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
            match
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  hint,
  tone = "neutral",
  to,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  hint: string;
  tone?: "good" | "warn" | "neutral";
  to: string;
}) {
  const accent =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <Link to={to} className="group block">
      <Card className="border-border/70 bg-card/90 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
          </div>
          <p className={`mt-2 font-display text-4xl leading-none tabular-nums ${accent}`}>
            {value}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function MatchRow({ grant, now }: { grant: MatchGrant; now: number }) {
  const f = Array.isArray(grant.funder) ? grant.funder[0] : grant.funder;
  const fit = grant.evaluation ? Math.round(grant.evaluation.fit_score * 100) : null;
  const eligible = grant.evaluation?.eligibility_pass ?? false;
  const days = grant.deadline
    ? Math.ceil((new Date(grant.deadline).getTime() - now) / DAY_MS)
    : null;
  const deadlineLabel =
    days == null
      ? "Rolling"
      : days < 0
        ? "Closed"
        : days === 0
          ? "Closes today"
          : `Closes in ${days}d`;
  const fitColor =
    fit == null
      ? "text-slate-400"
      : fit >= 70
        ? "text-emerald-600"
        : fit >= 45
          ? "text-amber-600"
          : "text-slate-400";

  return (
    <Link
      to="/grants/$id"
      params={{ id: grant.id }}
      className="flex items-center gap-4 rounded-xl border p-3 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{grant.title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{f?.name ?? "Unknown funder"}</span>
          <span aria-hidden>·</span>
          <span className={days != null && days <= 7 && days >= 0 ? "text-rose-600" : ""}>
            {deadlineLabel}
          </span>
        </p>
      </div>
      {eligible ? (
        <span className="hidden items-center gap-1 text-xs text-emerald-600 sm:inline-flex">
          <CheckCircle2 className="h-3.5 w-3.5" /> Eligible
        </span>
      ) : (
        <span className="hidden text-xs text-muted-foreground sm:inline">Check eligibility</span>
      )}
      {fit != null && (
        <div className="text-right">
          <div className={`font-display text-2xl leading-none tabular-nums ${fitColor}`}>{fit}</div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">match</div>
        </div>
      )}
    </Link>
  );
}
