import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2, XCircle, AlertTriangle, MinusCircle, X, Plus, Info,
  Scale, Briefcase, DollarSign, Target, Clock, Eye, Sparkles, Save, FlaskConical,
} from "lucide-react";
import type { FitRules } from "@/agents/fit-rules.server";

const rulesQO = queryOptions({ queryKey: ["fit-rules"], queryFn: () => getFitRules() });

export const Route = createFileRoute("/_authenticated/fit-rules")({
  head: () => ({ meta: [{ title: "Screening Rules — IIAL SOP v2" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQO),
  component: FitRulesPage,
});

// ─── Presets straight from SOP v2 ─────────────────────────────────────────────
const PRESETS = {
  jurisdictions: [
    { value: "CA", label: "Canada (federal)" },
    { value: "ON", label: "Ontario" }, { value: "QC", label: "Quebec" },
    { value: "BC", label: "British Columbia" }, { value: "AB", label: "Alberta" },
    { value: "MB", label: "Manitoba" }, { value: "SK", label: "Saskatchewan" },
    { value: "NS", label: "Nova Scotia" }, { value: "NB", label: "New Brunswick" },
    { value: "NL", label: "Newfoundland & Labrador" }, { value: "PE", label: "PEI" },
    { value: "YT", label: "Yukon" }, { value: "NT", label: "NWT" }, { value: "NU", label: "Nunavut" },
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
    { value: "wcis", label: "WCIS" },
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

function FitRulesPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(rulesQO);
  const save = useServerFn(saveFitRules);
  const preview = useServerFn(previewFitRules);

  const [r, setR] = useState<FitRules>(data.rules);
  const set = <K extends keyof FitRules>(k: K, v: FitRules[K]) => setR((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => save({ data: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fit-rules"] }),
  });
  const prev = useMutation({ mutationFn: () => preview({ data: { rules: r, limit: 20 } }) });

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <header className="max-w-6xl mx-auto mb-6">
        <nav className="flex gap-4 text-sm text-muted-foreground mb-3">
          <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
          <Link to="/grants" className="hover:text-foreground">Grants</Link>
          <Link to="/org" className="hover:text-foreground">Organization</Link>
          <span className="font-semibold text-foreground">Screening Rules</span>
        </nav>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Scale className="h-6 w-6" /> Screening Rules
              <Badge variant="outline" className="font-mono">SOP IIAL v2</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The 6-filter screening pipeline from IIAL's Grant Finding SOP. F1, F3, F4 and F5 run automatically on every grant. F2 (role) and F6 (effort) appear in the Opportunity Brief for human judgment.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => prev.mutate()} disabled={prev.isPending}>
              <FlaskConical className="h-4 w-4 mr-2" />
              {prev.isPending ? "Simulating…" : "Simulate"}
            </Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {mut.isPending ? "Saving…" : "Save rules"}
            </Button>
          </div>
        </div>
        {mut.isSuccess && <p className="mt-2 text-sm text-emerald-600">✓ Saved. Re-evaluate any grant to apply the new rules.</p>}
        {mut.isError && <p className="mt-2 text-sm text-destructive">{(mut.error as Error).message}</p>}
      </header>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* Verdict policy — universal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Verdict policy</CardTitle>
              <CardDescription>How the combined score is calculated and when a grant counts as "fit".</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Row label="Weight: rules vs LLM" value={`Rules ${Math.round((1 - r.weight_llm) * 100)}% · LLM ${Math.round(r.weight_llm * 100)}%`}>
                <Slider min={0} max={1} step={0.05} value={[r.weight_llm]} onValueChange={([v]) => set("weight_llm", v)} />
                <p className="text-[11px] text-muted-foreground mt-1">0 = trust rules only. 1 = trust the LLM only. SOP recommendation: ≤ 0.4.</p>
              </Row>
              <Row label="Fit pass threshold" value={`${r.threshold_fit_pass} / 100`}>
                <Slider min={0} max={100} step={5} value={[r.threshold_fit_pass]} onValueChange={([v]) => set("threshold_fit_pass", v)} />
              </Row>
              <ToggleRow
                label="Auto-archive grants that hard-fail"
                description="When off, hard-failures stay scored so you can review them manually."
                checked={r.auto_archive_on_fail} onChange={(v) => set("auto_archive_on_fail", v)}
              />
            </CardContent>
          </Card>

          <Tabs defaultValue="f1">
            <TabsList className="grid grid-cols-3 lg:grid-cols-6 h-auto">
              <TabsTrigger value="f1" className="flex-col gap-1 py-2"><Scale className="h-4 w-4" /><span className="text-[11px]">F1 Legal</span></TabsTrigger>
              <TabsTrigger value="f2" className="flex-col gap-1 py-2"><Briefcase className="h-4 w-4" /><span className="text-[11px]">F2 Role</span></TabsTrigger>
              <TabsTrigger value="f3" className="flex-col gap-1 py-2"><DollarSign className="h-4 w-4" /><span className="text-[11px]">F3 Money</span></TabsTrigger>
              <TabsTrigger value="f4" className="flex-col gap-1 py-2"><Target className="h-4 w-4" /><span className="text-[11px]">F4 Strategic</span></TabsTrigger>
              <TabsTrigger value="f5" className="flex-col gap-1 py-2"><Clock className="h-4 w-4" /><span className="text-[11px]">F5 Runway</span></TabsTrigger>
              <TabsTrigger value="f6" className="flex-col gap-1 py-2"><Eye className="h-4 w-4" /><span className="text-[11px]">F6 Effort</span></TabsTrigger>
            </TabsList>

            {/* ─── F1 LEGAL ─── */}
            <TabsContent value="f1">
              <FilterCard
                title="F1 — Legal eligibility"
                subtitle="Automated"
                description="Detects whether the program is restricted to applicant types that exclude IIAL, and verifies the program operates in IIAL's jurisdiction."
              >
                <Field label="Applicant types that exclude us" hint="Detected from phrases like 'only registered charities', 'municipalities only', etc.">
                  <PresetChips
                    value={r.applicant_types_excluded}
                    onChange={(v) => set("applicant_types_excluded", v)}
                    presets={PRESETS.applicantTypesExcluded}
                    placeholder="charity_only"
                  />
                </Field>
                <ToggleRow
                  label="Hard-fail when the program excludes our type"
                  description="If on, an excluded applicant type archives the grant regardless of LLM score."
                  checked={r.hard_fail_on_applicant_type}
                  onChange={(v) => set("hard_fail_on_applicant_type", v)}
                />

                <Field label="Required jurisdictions" hint="Grant must operate in at least one of these.">
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
                    presets={[]} placeholder="US" uppercase
                  />
                </Field>
                <ToggleRow
                  label="Hard-fail on jurisdiction mismatch"
                  checked={r.hard_fail_on_jurisdiction}
                  onChange={(v) => set("hard_fail_on_jurisdiction", v)}
                />
              </FilterCard>
            </TabsContent>

            {/* ─── F2 ROLE ─── */}
            <TabsContent value="f2">
              <FilterCard
                title="F2 — Role triage"
                subtitle="Semi-automatic"
                description="The system detects whether IIAL would apply as the Lead or as a Partner (municipalities, First Nations, etc.) and surfaces that in the Opportunity Brief. There are no thresholds to set here — the detected role drives runway requirements in F5 and partner notes in the brief."
              >
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>How role detection works</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">
                    The Discoverer + Evaluator agents scan eligibility text for partnership cues (municipality, city of, First Nation, co-applicant, lead applicant must be…) and applicant cues (non-profit, charity, SME, organization). Final role is reported in the brief as Lead / Partner / Unknown. When Unknown, F5 uses the stricter of the two runway thresholds.
                  </AlertDescription>
                </Alert>
              </FilterCard>
            </TabsContent>

            {/* ─── F3 MONEY ─── */}
            <TabsContent value="f3">
              <FilterCard
                title="F3 — Money math"
                subtitle="Automated"
                description="Award size and the cash-match IIAL would have to carry. Cost-share is detected from phrases like 'covers 80%', '50% match', '80/20', etc."
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Minimum award (CAD)">
                    <Input type="number" min={0} value={r.min_amount_cad ?? ""} placeholder="—"
                      onChange={(e) => set("min_amount_cad", e.target.value ? Number(e.target.value) : null)} />
                  </Field>
                  <Field label="Maximum award (CAD)">
                    <Input type="number" min={0} value={r.max_amount_cad ?? ""} placeholder="—"
                      onChange={(e) => set("max_amount_cad", e.target.value ? Number(e.target.value) : null)} />
                  </Field>
                </div>
                <ToggleRow
                  label="Hard-fail when award is outside the range"
                  checked={r.hard_fail_on_amount}
                  onChange={(v) => set("hard_fail_on_amount", v)}
                />

                <Field label="Max % cost-share IIAL can carry" hint="If the grant covers 60% and we have to carry 40%, this stays within a 50% cap.">
                  <div className="flex items-center gap-3">
                    <Input type="number" min={0} max={100} className="max-w-[120px]"
                      value={r.max_cost_share_pct_org_carries ?? ""} placeholder="50"
                      onChange={(e) => set("max_cost_share_pct_org_carries", e.target.value ? Number(e.target.value) : null)} />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </Field>
                <ToggleRow
                  label="Require manual cash-match verification"
                  description="When the grant requires any cost-share, the brief flags a 'verify cash match with leadership' step."
                  checked={r.require_match_verification}
                  onChange={(v) => set("require_match_verification", v)}
                />
              </FilterCard>
            </TabsContent>

            {/* ─── F4 STRATEGIC ─── */}
            <TabsContent value="f4">
              <FilterCard
                title="F4 — Strategic fit"
                subtitle="Automated"
                description="At least one of IIAL's strategic capabilities must appear in the grant's objectives, eligibility or summary."
              >
                <Field label="IIAL capabilities" hint="The 6 core capability families from the SOP. Edit only if strategy shifts.">
                  <PresetChips
                    value={r.iial_capabilities}
                    onChange={(v) => set("iial_capabilities", v)}
                    presets={PRESETS.iialCapabilities}
                    placeholder="supply chain"
                  />
                </Field>
                <ToggleRow
                  label="Hard-fail when no capability is mentioned"
                  description="Strict mode — keep off unless the funnel is full of off-strategy grants."
                  checked={r.hard_fail_on_capability}
                  onChange={(v) => set("hard_fail_on_capability", v)}
                />

                <Field label="Sectors required (soft)" hint="At least one must overlap the grant's sectors. Soft — no hard-fail.">
                  <PresetChips value={r.required_sectors} onChange={(v) => set("required_sectors", v)} presets={[]} placeholder="tech" />
                </Field>
                <Field label="Sectors excluded (soft)">
                  <PresetChips value={r.excluded_sectors} onChange={(v) => set("excluded_sectors", v)} presets={[]} placeholder="tobacco" />
                </Field>
              </FilterCard>
            </TabsContent>

            {/* ─── F5 RUNWAY ─── */}
            <TabsContent value="f5">
              <FilterCard
                title="F5 — Runway"
                subtitle="Automated"
                description="How many weeks between today and the deadline are required, based on the detected role from F2."
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min weeks — as Lead applicant" hint="IIAL needs more lead time when we drive the submission.">
                    <Input type="number" min={0} value={r.lead_min_weeks ?? ""} placeholder="4"
                      onChange={(e) => set("lead_min_weeks", e.target.value ? Number(e.target.value) : null)} />
                  </Field>
                  <Field label="Min weeks — as Partner" hint="More time needed to coordinate with the lead applicant.">
                    <Input type="number" min={0} value={r.partner_min_weeks ?? ""} placeholder="8"
                      onChange={(e) => set("partner_min_weeks", e.target.value ? Number(e.target.value) : null)} />
                  </Field>
                </div>
                <ToggleRow
                  label="Rolling intake automatically passes runway"
                  description="Programs without a fixed deadline are treated as having enough runway."
                  checked={r.rolling_intake_passes_runway}
                  onChange={(v) => set("rolling_intake_passes_runway", v)}
                />
                <ToggleRow
                  label="Hard-fail when runway is insufficient"
                  checked={r.hard_fail_on_runway}
                  onChange={(v) => set("hard_fail_on_runway", v)}
                />
              </FilterCard>
            </TabsContent>

            {/* ─── F6 EFFORT ─── */}
            <TabsContent value="f6">
              <FilterCard
                title="F6 — Effort vs win"
                subtitle="Manual"
                description="Effort estimation is a judgment call. Reviewed by the human reader in the Opportunity Brief."
              >
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>What the brief surfaces for you</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed space-y-1">
                    <div>• Mandatory components (letters of support, partnership agreements, audited financials)</div>
                    <div>• Required partner search and likely timeline</div>
                    <div>• Cash-match availability and reporting burden</div>
                    <div>• Recommendation: <strong>Go</strong> / <strong>No-Go</strong> / <strong>Go-Conditional</strong></div>
                  </AlertDescription>
                </Alert>
              </FilterCard>
            </TabsContent>
          </Tabs>

          {/* Advanced (legacy generic keyword filters, collapsed by default look) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advanced — generic keyword filters</CardTitle>
              <CardDescription>Free-form keyword lists for edge cases not covered by F1–F5.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Required keywords (all must appear)">
                <PresetChips value={r.required_keywords} onChange={(v) => set("required_keywords", v)} presets={[]} placeholder="SME" />
              </Field>
              <Field label="Excluded keywords (none may appear)">
                <PresetChips value={r.excluded_keywords} onChange={(v) => set("excluded_keywords", v)} presets={[]} placeholder="non-profit only" />
              </Field>
              <ToggleRow
                label="Hard-fail on excluded keyword"
                checked={r.hard_fail_on_excluded_keyword}
                onChange={(v) => set("hard_fail_on_excluded_keyword", v)}
              />
              <Field label="Min days to deadline (generic, ignored when F5 applies)">
                <Input type="number" min={0} value={r.min_days_to_deadline ?? ""} placeholder="—"
                  onChange={(e) => set("min_days_to_deadline", e.target.value ? Number(e.target.value) : null)} />
              </Field>
              <ToggleRow
                label="Hard-fail when generic deadline rule fails"
                checked={r.hard_fail_on_deadline}
                onChange={(v) => set("hard_fail_on_deadline", v)}
              />
            </CardContent>
          </Card>
        </div>

        {/* Live simulation sidebar */}
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Live simulation</CardTitle>
              <CardDescription>Applies the unsaved rules to existing enriched grants.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[78vh] overflow-y-auto">
              {!prev.data && <p className="text-xs text-muted-foreground">Press <strong>Simulate</strong> to see the impact.</p>}
              {prev.data?.items.length === 0 && <p className="text-xs text-muted-foreground">No enriched grants yet.</p>}
              {prev.data?.items.map((it) => (
                <div key={it.id} className="rounded border p-2 text-xs space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link to="/grants/$id" params={{ id: it.id }} className="font-medium line-clamp-2 hover:underline">{it.title}</Link>
                    <Badge variant={it.hard_fail ? "destructive" : it.rule_score >= 60 ? "default" : "secondary"} className="shrink-0">
                      {it.rule_score}
                    </Badge>
                  </div>
                  {it.checks.length === 0 ? (
                    <p className="text-muted-foreground italic">no rules applied</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {it.checks.map((c) => (
                        <li key={c.id} className="flex items-start gap-1.5">
                          <StatusIcon s={c.status} />
                          <span className="flex-1">
                            <span className={c.hard && c.status === "fail" ? "font-medium" : ""}>{c.label}</span>
                            <span className="text-muted-foreground"> — {c.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

// ─── Reusable bits ────────────────────────────────────────────────────────────
function FilterCard({ title, subtitle, description, children }: { title: string; subtitle: "Automated" | "Manual" | "Semi-automatic"; description: string; children: React.ReactNode }) {
  const tone = subtitle === "Automated" ? "default" : subtitle === "Manual" ? "secondary" : "outline";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={tone} className="text-[10px] uppercase">{subtitle}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="font-mono text-xs">{value}</span>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="space-y-0.5">
        <Label className="text-xs font-medium">{label}</Label>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

type Preset = { value: string; label: string };
function PresetChips({ value, onChange, presets, placeholder, uppercase }: { value: string[]; onChange: (v: string[]) => void; presets: Preset[]; placeholder: string; uppercase?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = (raw?: string) => {
    const v = (uppercase ? (raw ?? draft).toUpperCase() : (raw ?? draft)).trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {value.length === 0 && <span className="text-xs text-muted-foreground italic">none</span>}
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 pr-1">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded hover:bg-muted-foreground/20 p-0.5">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} className="h-9" />
        <Button type="button" size="sm" variant="outline" onClick={() => add()}><Plus className="h-4 w-4" /></Button>
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          <span className="text-[10px] text-muted-foreground uppercase mr-1 self-center">presets:</span>
          {presets.filter((p) => !value.includes(p.value)).map((p) => (
            <button key={p.value} type="button" onClick={() => add(p.value)}
              className="text-[11px] px-2 py-0.5 rounded-full border bg-background hover:bg-muted transition">
              + {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ s }: { s: "pass" | "fail" | "warn" | "skip" }) {
  if (s === "pass") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
  if (s === "fail") return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
  return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}
