import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFitRules, saveFitRules, previewFitRules } from "@/lib/fit-rules.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  X,
  Plus,
  Scale,
  Briefcase,
  DollarSign,
  Target,
  Clock,
  Eye,
  Save,
  FlaskConical,
  ChevronDown,
  RotateCcw,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { DEFAULT_RULES, type FitRules } from "@/agents/fit-rules.shared";
import { cn } from "@/lib/utils";
import { AppTopBar } from "@/components/AppSidebar";

const rulesQO = queryOptions({ queryKey: ["fit-rules"], queryFn: () => getFitRules() });

export const Route = createFileRoute("/_authenticated/fit-rules")({
  head: () => ({ meta: [{ title: "Screening Rules — IIAL" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQO),
  component: FitRulesPage,
});

// ─── Reference data ───────────────────────────────────────────────────────────
const PRESETS = {
  jurisdictions: [
    { value: "CA", label: "Canada (federal)" },
    { value: "ON", label: "Ontario" },
    { value: "QC", label: "Quebec" },
    { value: "BC", label: "British Columbia" },
    { value: "AB", label: "Alberta" },
    { value: "MB", label: "Manitoba" },
    { value: "SK", label: "Saskatchewan" },
    { value: "NS", label: "Nova Scotia" },
    { value: "NB", label: "New Brunswick" },
    { value: "NL", label: "Newfoundland & Labrador" },
    { value: "PE", label: "PEI" },
    { value: "YT", label: "Yukon" },
    { value: "NT", label: "NWT" },
    { value: "NU", label: "Nunavut" },
  ],
  applicantTypesExcluded: [
    { value: "charity_only", label: "Charity-only" },
    { value: "municipality_only", label: "Municipality-only" },
    { value: "university_only", label: "University-only" },
    { value: "individual_only", label: "Individuals-only" },
    { value: "for_profit_only", label: "For-profit-only" },
  ],
  iialCapabilities: [
    { value: "supply chain", label: "Supply Chain (WCIS)" },
    { value: "traceability", label: "Traceability" },
    { value: "micro-credential", label: "Micro-credentials" },
    { value: "applied research", label: "Applied Research" },
    { value: "feasibility", label: "Feasibility Studies" },
    { value: "smart city", label: "Smart Cities" },
    { value: "aiot", label: "AIoT" },
    { value: "climate", label: "Climate" },
    { value: "sustainability", label: "Sustainability" },
    { value: "international development", label: "International Dev" },
  ],
};

// ─── Strictness presets ──────────────────────────────────────────────────────
type StrictnessId = "relaxed" | "balanced" | "strict";
const STRICTNESS: Record<
  StrictnessId,
  { label: string; tagline: string; patch: Partial<FitRules> }
> = {
  relaxed: {
    label: "Relaxed",
    tagline: "Catch everything — review manually.",
    patch: {
      weight_llm: 0.6,
      threshold_fit_pass: 45,
      hard_fail_on_jurisdiction: false,
      hard_fail_on_applicant_type: false,
      hard_fail_on_runway: false,
      hard_fail_on_capability: false,
      hard_fail_on_amount: false,
      hard_fail_on_excluded_keyword: false,
      auto_archive_on_fail: false,
    },
  },
  balanced: {
    label: "Balanced",
    tagline: "IIAL default — the SOP recommendation.",
    patch: { ...DEFAULT_RULES },
  },
  strict: {
    label: "Strict",
    tagline: "Only high-confidence matches reach the inbox.",
    patch: {
      weight_llm: 0.3,
      threshold_fit_pass: 75,
      hard_fail_on_jurisdiction: true,
      hard_fail_on_applicant_type: true,
      hard_fail_on_runway: true,
      hard_fail_on_capability: true,
      hard_fail_on_amount: true,
      hard_fail_on_excluded_keyword: true,
      auto_archive_on_fail: true,
    },
  },
};

function detectStrictness(r: FitRules): StrictnessId | "custom" {
  for (const id of ["relaxed", "balanced", "strict"] as StrictnessId[]) {
    const p = STRICTNESS[id].patch;
    const match = (Object.keys(p) as (keyof FitRules)[]).every((k) => {
      const a = r[k],
        b = p[k];
      if (Array.isArray(a) && Array.isArray(b))
        return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      return a === b;
    });
    if (match) return id;
  }
  return "custom";
}

// ─── Component ───────────────────────────────────────────────────────────────
function FitRulesPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(rulesQO);
  const save = useServerFn(saveFitRules);
  const preview = useServerFn(previewFitRules);

  const [r, setR] = useState<FitRules>(data.rules);
  const set = <K extends keyof FitRules>(k: K, v: FitRules[K]) => setR((p) => ({ ...p, [k]: v }));
  const applyPreset = (id: StrictnessId) => setR((p) => ({ ...p, ...STRICTNESS[id].patch }));
  const strictness = useMemo(() => detectStrictness(r), [r]);
  const dirty = useMemo(() => JSON.stringify(r) !== JSON.stringify(data.rules), [r, data.rules]);

  const mut = useMutation({
    mutationFn: () => save({ data: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fit-rules"] }),
  });
  const prev = useMutation({ mutationFn: () => preview({ data: { rules: r, limit: 20 } }) });

  const stats = useMemo(() => {
    const items = prev.data?.items ?? [];
    const pass = items.filter((i) => !i.hard_fail && i.rule_score >= r.threshold_fit_pass).length;
    const block = items.filter((i) => i.hard_fail).length;
    const review = items.length - pass - block;
    return { pass, block, review, total: items.length };
  }, [prev.data, r.threshold_fit_pass]);

  return (
    <main className="min-h-screen text-foreground pb-24">
      <AppTopBar title="Screening rules" />
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="border-b border-border/60 bg-card/60">
        <div className="max-w-6xl mx-auto px-6 pt-6 pb-5">
          <nav className="flex gap-4 text-sm text-muted-foreground mb-3">
            <Link to="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/grants" className="hover:text-foreground">
              Grants
            </Link>
            <Link to="/org" className="hover:text-foreground">
              Organization
            </Link>
            <span className="font-semibold text-foreground">Screening Rules</span>
          </nav>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="font-display text-2xl tracking-tight">Screening rules</h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Decide which grants land in your inbox. Pick a profile to start, then fine-tune any
                filter.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setR(DEFAULT_RULES)}
                disabled={!dirty}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => prev.mutate()}
                disabled={prev.isPending}
              >
                <FlaskConical className="h-4 w-4 mr-1.5" />
                {prev.isPending ? "Simulating…" : "Simulate impact"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-6 grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6 min-w-0">
          {/* ── Strictness selector ────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Choose your screening profile
              </CardTitle>
              <CardDescription>One click. You can still tweak any filter below.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-2">
                {(["relaxed", "balanced", "strict"] as StrictnessId[]).map((id) => {
                  const active = strictness === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyPreset(id)}
                      className={cn(
                        "text-left rounded-lg border p-3 transition-all hover:border-primary/60",
                        active && "border-primary ring-2 ring-primary/20 bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{STRICTNESS[id].label}</span>
                        {active && (
                          <Badge variant="default" className="text-[10px] h-4">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {STRICTNESS[id].tagline}
                      </p>
                    </button>
                  );
                })}
              </div>
              {strictness === "custom" && (
                <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" /> Custom profile — based on Balanced with your
                  overrides.
                </p>
              )}

              <div className="mt-5 rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
                <PlainEnglishSummary r={r} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <SliderRow
                  label="Fit score to pass"
                  value={`${r.threshold_fit_pass} / 100`}
                  hint="Combined score (rules + AI) needed to mark a grant as a match."
                >
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[r.threshold_fit_pass]}
                    onValueChange={([v]) => set("threshold_fit_pass", v)}
                  />
                </SliderRow>
                <SliderRow
                  label="Trust the AI vs. the rules"
                  value={`Rules ${Math.round((1 - r.weight_llm) * 100)}% · AI ${Math.round(r.weight_llm * 100)}%`}
                  hint="Lower = stick to deterministic rules. Higher = trust the LLM verdict more."
                >
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[r.weight_llm]}
                    onValueChange={([v]) => set("weight_llm", v)}
                  />
                </SliderRow>
              </div>

              <div className="mt-4">
                <ToggleRow
                  label="Auto-archive grants that fail a hard filter"
                  description="When off, blocked grants stay visible so you can override the rules manually."
                  checked={r.auto_archive_on_fail}
                  onChange={(v) => set("auto_archive_on_fail", v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Filters ─────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                The 6 filters
              </h2>
              <span className="text-[11px] text-muted-foreground">
                From IIAL Grant Finding SOP v2
              </span>
            </div>

            {/* F1 Legal */}
            <FilterBlock
              icon={Scale}
              code="F1"
              title="Legal eligibility"
              tone="auto"
              summary="Skip grants restricted to applicant types or jurisdictions IIAL can't apply to."
              hardEnabled={r.hard_fail_on_applicant_type || r.hard_fail_on_jurisdiction}
              defaultOpen
            >
              <Field
                label="Applicant types that exclude us"
                hint='Detected from phrases like "only registered charities" or "municipalities only".'
              >
                <PresetChips
                  value={r.applicant_types_excluded}
                  onChange={(v) => set("applicant_types_excluded", v)}
                  presets={PRESETS.applicantTypesExcluded}
                  placeholder="charity_only"
                />
              </Field>
              <ToggleRow
                compact
                label="Block when an excluded type is detected"
                checked={r.hard_fail_on_applicant_type}
                onChange={(v) => set("hard_fail_on_applicant_type", v)}
              />

              <Separator />

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Required jurisdictions" hint="Grant must operate in at least one.">
                  <PresetChips
                    value={r.required_jurisdictions}
                    onChange={(v) => set("required_jurisdictions", v)}
                    presets={PRESETS.jurisdictions}
                    placeholder="CA"
                    uppercase
                  />
                </Field>
                <Field label="Excluded jurisdictions">
                  <PresetChips
                    value={r.excluded_jurisdictions}
                    onChange={(v) => set("excluded_jurisdictions", v)}
                    presets={[]}
                    placeholder="US"
                    uppercase
                  />
                </Field>
              </div>
              <ToggleRow
                compact
                label="Block when jurisdiction doesn't match"
                checked={r.hard_fail_on_jurisdiction}
                onChange={(v) => set("hard_fail_on_jurisdiction", v)}
              />
            </FilterBlock>

            {/* F2 Role */}
            <FilterBlock
              icon={Briefcase}
              code="F2"
              title="Role triage"
              tone="hybrid"
              summary="The system detects whether IIAL applies as Lead or Partner and surfaces it in the brief."
              hardEnabled={false}
            >
              <p className="text-xs text-muted-foreground leading-relaxed">
                The Discoverer and Evaluator scan eligibility text for partnership cues
                (municipality, First Nation, co-applicant…) and applicant cues (non-profit, SME,
                charity). Detected role drives the F5 runway threshold. There's nothing to configure
                here — keep your Lead vs Partner runway tuned in F5.
              </p>
            </FilterBlock>

            {/* F3 Money */}
            <FilterBlock
              icon={DollarSign}
              code="F3"
              title="Money math"
              tone="auto"
              summary="Filter by award size and the cash-match IIAL would have to carry."
              hardEnabled={r.hard_fail_on_amount}
            >
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Minimum award (CAD)">
                  <Input
                    type="number"
                    min={0}
                    value={r.min_amount_cad ?? ""}
                    placeholder="No minimum"
                    onChange={(e) =>
                      set("min_amount_cad", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
                <Field label="Maximum award (CAD)">
                  <Input
                    type="number"
                    min={0}
                    value={r.max_amount_cad ?? ""}
                    placeholder="No maximum"
                    onChange={(e) =>
                      set("max_amount_cad", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
              </div>
              <ToggleRow
                compact
                label="Block when the award is outside the range"
                checked={r.hard_fail_on_amount}
                onChange={(v) => set("hard_fail_on_amount", v)}
              />

              <Separator />

              <Field
                label="Max cost-share IIAL can carry"
                hint="If the grant covers 60% and we cover 40%, that stays within a 50% cap."
              >
                <div className="flex items-center gap-2 max-w-[200px]">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={r.max_cost_share_pct_org_carries ?? ""}
                    placeholder="50"
                    onChange={(e) =>
                      set(
                        "max_cost_share_pct_org_carries",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </Field>
              <ToggleRow
                compact
                label='Flag "verify cash match" in the Opportunity Brief'
                description="When any cost-share is detected, surfaces a manual confirmation step."
                checked={r.require_match_verification}
                onChange={(v) => set("require_match_verification", v)}
              />
            </FilterBlock>

            {/* F4 Strategic */}
            <FilterBlock
              icon={Target}
              code="F4"
              title="Strategic fit"
              tone="auto"
              summary="At least one IIAL capability must appear in the grant's objectives."
              hardEnabled={r.hard_fail_on_capability}
            >
              <Field
                label="IIAL capabilities"
                hint="Edit only when your strategy shifts. Defaults reflect the 6 SOP capabilities."
              >
                <PresetChips
                  value={r.iial_capabilities}
                  onChange={(v) => set("iial_capabilities", v)}
                  presets={PRESETS.iialCapabilities}
                  placeholder="supply chain"
                />
              </Field>
              <ToggleRow
                compact
                label="Block when no capability is mentioned"
                description="Strict mode — leave off unless the inbox fills with off-strategy grants."
                checked={r.hard_fail_on_capability}
                onChange={(v) => set("hard_fail_on_capability", v)}
              />

              <Separator />

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Sectors required (soft)">
                  <PresetChips
                    value={r.required_sectors}
                    onChange={(v) => set("required_sectors", v)}
                    presets={[]}
                    placeholder="tech"
                  />
                </Field>
                <Field label="Sectors excluded (soft)">
                  <PresetChips
                    value={r.excluded_sectors}
                    onChange={(v) => set("excluded_sectors", v)}
                    presets={[]}
                    placeholder="tobacco"
                  />
                </Field>
              </div>
            </FilterBlock>

            {/* F5 Runway */}
            <FilterBlock
              icon={Clock}
              code="F5"
              title="Runway"
              tone="auto"
              summary="Minimum weeks before the deadline, by detected role."
              hardEnabled={r.hard_fail_on_runway}
            >
              <div className="grid sm:grid-cols-2 gap-3">
                <Field
                  label="Min weeks — as Lead"
                  hint="More lead time when IIAL drives the submission."
                >
                  <Input
                    type="number"
                    min={0}
                    value={r.lead_min_weeks ?? ""}
                    placeholder="4"
                    onChange={(e) =>
                      set("lead_min_weeks", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
                <Field
                  label="Min weeks — as Partner"
                  hint="More coordination time with the lead applicant."
                >
                  <Input
                    type="number"
                    min={0}
                    value={r.partner_min_weeks ?? ""}
                    placeholder="8"
                    onChange={(e) =>
                      set("partner_min_weeks", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
              </div>
              <ToggleRow
                compact
                label="Rolling intake automatically passes runway"
                checked={r.rolling_intake_passes_runway}
                onChange={(v) => set("rolling_intake_passes_runway", v)}
              />
              <ToggleRow
                compact
                label="Block when runway is too short"
                checked={r.hard_fail_on_runway}
                onChange={(v) => set("hard_fail_on_runway", v)}
              />
            </FilterBlock>

            {/* F6 Effort */}
            <FilterBlock
              icon={Eye}
              code="F6"
              title="Effort vs win"
              tone="manual"
              summary="Surfaced in the Opportunity Brief for human judgment. Review-only."
              hardEnabled={false}
            >
              <ul className="text-xs text-muted-foreground space-y-1 leading-relaxed">
                <li>
                  • Mandatory components (letters of support, partnership agreements, audited
                  financials)
                </li>
                <li>• Required partner search and likely timeline</li>
                <li>• Cash-match availability and reporting burden</li>
                <li>
                  • Recommendation: <strong className="text-foreground">Go</strong> /{" "}
                  <strong className="text-foreground">No-Go</strong> /{" "}
                  <strong className="text-foreground">Go-Conditional</strong>
                </li>
              </ul>
            </FilterBlock>
          </div>

          {/* ── Advanced ─────────────────────────────────────── */}
          <Collapsible>
            <Card>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors rounded-lg">
                  <div>
                    <div className="font-semibold text-sm">Advanced — generic keyword filters</div>
                    <div className="text-xs text-muted-foreground">
                      Free-form rules for edge cases not covered by F1–F5.
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <Field label="Required keywords (all must appear)">
                    <PresetChips
                      value={r.required_keywords}
                      onChange={(v) => set("required_keywords", v)}
                      presets={[]}
                      placeholder="SME"
                    />
                  </Field>
                  <Field label="Excluded keywords (none may appear)">
                    <PresetChips
                      value={r.excluded_keywords}
                      onChange={(v) => set("excluded_keywords", v)}
                      presets={[]}
                      placeholder="non-profit only"
                    />
                  </Field>
                  <ToggleRow
                    compact
                    label="Block on excluded keyword match"
                    checked={r.hard_fail_on_excluded_keyword}
                    onChange={(v) => set("hard_fail_on_excluded_keyword", v)}
                  />
                  <Field label="Min days to deadline (ignored when F5 applies)">
                    <Input
                      type="number"
                      min={0}
                      value={r.min_days_to_deadline ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        set("min_days_to_deadline", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </Field>
                  <ToggleRow
                    compact
                    label="Block when generic deadline rule fails"
                    checked={r.hard_fail_on_deadline}
                    onChange={(v) => set("hard_fail_on_deadline", v)}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        {/* ── Right rail: simulation ───────────────────────── */}
        <aside>
          <div className="sticky top-4 space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-primary" /> Live impact
                </CardTitle>
                <CardDescription className="text-xs">
                  Runs your unsaved rules against the latest enriched grants.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <StatPill label="Pass" value={stats.pass} tone="pass" />
                  <StatPill label="Review" value={stats.review} tone="warn" />
                  <StatPill label="Blocked" value={stats.block} tone="fail" />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => prev.mutate()}
                  disabled={prev.isPending}
                >
                  {prev.isPending
                    ? "Simulating…"
                    : prev.data
                      ? "Re-run simulation"
                      : "Run simulation"}
                </Button>
                <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1 space-y-2">
                  {!prev.data && (
                    <p className="text-xs text-muted-foreground italic py-4 text-center">
                      Click <strong>Run simulation</strong> to preview the impact.
                    </p>
                  )}
                  {prev.data?.items.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-4 text-center">
                      No enriched grants yet.
                    </p>
                  )}
                  {prev.data?.items.map((it) => (
                    <div key={it.id} className="rounded-md border p-2 text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to="/grants/$id"
                          params={{ id: it.id }}
                          className="font-medium line-clamp-2 hover:underline"
                        >
                          {it.title}
                        </Link>
                        <Badge
                          variant={
                            it.hard_fail
                              ? "destructive"
                              : it.rule_score >= r.threshold_fit_pass
                                ? "default"
                                : "secondary"
                          }
                          className="shrink-0 font-mono text-[10px]"
                        >
                          {it.rule_score}
                        </Badge>
                      </div>
                      {it.checks.length > 0 && (
                        <ul className="space-y-0.5">
                          {it.checks.slice(0, 4).map((c) => (
                            <li key={c.id} className="flex items-start gap-1.5">
                              <StatusIcon s={c.status} />
                              <span
                                className={cn(
                                  "flex-1",
                                  c.hard && c.status === "fail" && "font-medium",
                                )}
                              >
                                {c.label}
                              </span>
                            </li>
                          ))}
                          {it.checks.length > 4 && (
                            <li className="text-[10px] text-muted-foreground pl-5">
                              +{it.checks.length - 4} more checks
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {/* ── Sticky save bar ──────────────────────────────────── */}
      {dirty && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur-md shadow-lg">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-medium">Unsaved changes</span>
              <span className="text-muted-foreground"> — re-evaluate any grant to apply.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setR(data.rules)}>
                Discard
              </Button>
              <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
                <Save className="h-4 w-4 mr-1.5" />
                {mut.isPending ? "Saving…" : "Save rules"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {mut.isSuccess && !dirty && (
        <div className="fixed bottom-4 right-4 z-40 rounded-md bg-emerald-600 text-white text-sm px-4 py-2 shadow-lg">
          ✓ Rules saved
        </div>
      )}
      {mut.isError && (
        <div className="fixed bottom-4 right-4 z-40 rounded-md bg-destructive text-destructive-foreground text-sm px-4 py-2 shadow-lg">
          {(mut.error as Error).message}
        </div>
      )}
    </main>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────
function PlainEnglishSummary({ r }: { r: FitRules }) {
  const parts: string[] = [];
  parts.push("Show me grants");
  if (r.required_jurisdictions.length > 0) parts.push(`in ${r.required_jurisdictions.join(", ")}`);
  if (r.min_amount_cad || r.max_amount_cad) {
    const min = r.min_amount_cad ? `$${r.min_amount_cad.toLocaleString()}` : "any";
    const max = r.max_amount_cad ? `$${r.max_amount_cad.toLocaleString()}` : "any";
    parts.push(`between ${min} and ${max}`);
  }
  if (r.iial_capabilities.length > 0) {
    const top = r.iial_capabilities.slice(0, 3).join(", ");
    parts.push(`touching ${top}${r.iial_capabilities.length > 3 ? "…" : ""}`);
  }
  if (r.lead_min_weeks || r.partner_min_weeks) {
    parts.push(
      `with ≥${r.lead_min_weeks ?? "?"}w runway as Lead / ≥${r.partner_min_weeks ?? "?"}w as Partner`,
    );
  }
  parts.push(`scoring ≥${r.threshold_fit_pass}/100.`);
  return (
    <p className="text-foreground/90">
      <span className="text-muted-foreground">In plain English: </span>
      {parts.join(" ")}
    </p>
  );
}

function FilterBlock({
  icon: Icon,
  code,
  title,
  tone,
  summary,
  hardEnabled,
  defaultOpen,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  code: string;
  title: string;
  tone: "auto" | "manual" | "hybrid";
  summary: string;
  hardEnabled: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const toneBadge =
    tone === "auto"
      ? {
          label: "Automatic",
          cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
        }
      : tone === "manual"
        ? {
            label: "Manual",
            cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
          }
        : {
            label: "Hybrid",
            cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
          };
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn("transition-shadow", open && "shadow-md")}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors rounded-t-lg">
            <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
                  {code}
                </span>
                <span className="font-semibold text-sm">{title}</span>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] h-4 px-1.5 border", toneBadge.cls)}
                >
                  {toneBadge.label}
                </Badge>
                {hardEnabled && (
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1.5 border-destructive/30 text-destructive"
                  >
                    hard block
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{summary}</p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform shrink-0 mt-1",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4 border-t">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Separator() {
  return <div className="border-t -mx-6 my-2" />;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SliderRow({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <Label className="font-medium">{label}</Label>
        <span className="font-mono text-[11px] text-muted-foreground">{value}</span>
      </div>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  compact,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border",
        compact ? "p-2.5" : "p-3",
      )}
    >
      <div className="space-y-0.5 min-w-0">
        <Label className="text-xs font-medium">{label}</Label>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pass" | "warn" | "fail";
}) {
  const cls =
    tone === "pass"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "bg-destructive/10 text-destructive";
  return (
    <div className={cn("rounded-md py-2", cls)}>
      <div className="text-lg font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide mt-1 opacity-80">{label}</div>
    </div>
  );
}

type Preset = { value: string; label: string };
function PresetChips({
  value,
  onChange,
  presets,
  placeholder,
  uppercase,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  presets: Preset[];
  placeholder: string;
  uppercase?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw?: string) => {
    const v = (uppercase ? (raw ?? draft).toUpperCase() : (raw ?? draft)).trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  const labelFor = (v: string) => presets.find((p) => p.value === v)?.label ?? v;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground italic self-center">none</span>
        )}
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 pr-1 font-normal">
            {labelFor(v)}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="rounded hover:bg-muted-foreground/20 p-0.5"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-9"
        />
        <Button type="button" size="sm" variant="outline" onClick={() => add()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {presets
            .filter((p) => !value.includes(p.value))
            .map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => add(p.value)}
                className="text-[11px] px-2 py-0.5 rounded-full border bg-background hover:bg-muted hover:border-primary/40 transition"
              >
                + {p.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ s }: { s: "pass" | "fail" | "warn" | "skip" }) {
  if (s === "pass")
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />;
  if (s === "fail") return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />;
  return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
}
