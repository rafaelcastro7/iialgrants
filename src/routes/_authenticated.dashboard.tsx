import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getOrgProfile } from "@/lib/org.functions";
import { listGrants } from "@/lib/grants.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { syncClientLocale } from "@/i18n/sync";
import { AppTopBar } from "@/components/AppSidebar";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PageTransition } from "@/components/PageTransition";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  Search,
  Sparkles,
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
function Dashboard() {
  const { t } = useTranslation();
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
  const closingSoon = grants.filter((g) => {
    if (!g.deadline) return false;
    const d = (new Date(g.deadline).getTime() - now) / DAY_MS;
    return d >= 0 && d <= 30;
  }).length;
  const inPipeline = grants.filter((g) =>
    ["shortlisted", "in_proposal", "submitted", "won"].includes(g.status),
  ).length;

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
              hint="Live grants tracked"
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
              hint="Deadline within 30 days"
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

type MatchGrant = {
  id: string;
  title: string;
  deadline: string | null;
  funder: { name: string } | { name: string }[] | null;
  evaluation: { fit_score: number; eligibility_pass: boolean } | null;
};

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
