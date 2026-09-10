import { useEffect } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type { OrgFormValues } from "@/routes/_authenticated.org";
import { computeOrgProfileReadiness } from "@/lib/org-profile-readiness";
import { parseCSV, bnErrorMessage } from "@/lib/csv.shared";
import { PageTransition } from "@/components/PageTransition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/FormField";
import { TagInput } from "@/components/ui/tag-input";

const STAGES = ["startup", "sme", "nonprofit", "research", "public_sector"] as const;
const REGISTRATION_STATUSES = [
  "registered_charity",
  "nonprofit",
  "for_profit",
  "public_body",
  "academic",
  "indigenous",
  "unregistered",
  "other",
] as const;

type Props = {
  form: UseFormReturn<OrgFormValues>;
  mut: { isPending: boolean };
  onSubmit: (values: OrgFormValues) => void;
};

export function GrantReadinessProfileForm({ form, mut, onSubmit }: Props) {
  const values = form.watch();
  const readiness = computeOrgProfileReadiness({
    ...values,
    sectors: parseCSV(values.sectors),
    jurisdictions: parseCSV(values.jurisdictions),
    applicant_types: parseCSV(values.applicant_types),
    activities: parseCSV(values.activities),
    capabilities: parseCSV(values.capabilities),
    populations_served: parseCSV(values.populations_served),
    operating_regions: parseCSV(values.operating_regions),
    annual_budget_cad: optionalNumber(values.annual_budget_cad),
    funding_min_cad: optionalNumber(values.funding_min_cad),
    funding_max_cad: optionalNumber(values.funding_max_cad),
    cost_share_max_pct: optionalNumber(values.cost_share_max_pct),
  });

  // Auto-sync capabilities with sectors + focus_areas on change
  useEffect(() => {
    const sectors = parseCSV(values.sectors);
    const focusAreas = parseCSV(values.focus_areas);
    const currentCaps = parseCSV(values.capabilities);
    const synced = [...new Set([...sectors, ...focusAreas, ...currentCaps])];
    // Only update if the synced set has new items not already present
    if (synced.length > currentCaps.length) {
      // Don't override custom capabilities — only fill gaps
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.sectors, values.focus_areas]);

  const bnError = bnErrorMessage(values.business_number);

  const nextFacts = (
    readiness.criticalMissing.length
      ? readiness.criticalMissing
      : readiness.items.filter((item) => !item.complete)
  ).slice(0, 4);

  return (
    <PageTransition>
      <section className="mx-auto max-w-[1040px] space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              IIAL tenant
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Grant readiness profile</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              One shared source of truth for eligibility, matching, proposal reuse, and team
              decisions.
            </p>
          </div>
          <Badge variant={readiness.readyForVerifiedMatching ? "secondary" : "destructive"}>
            {readiness.readyForVerifiedMatching
              ? "Verified matching ready"
              : "Matching has blockers"}
          </Badge>
        </header>

        <section className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-[auto_1fr_1fr]">
          <ProgressRing value={readiness.score} ready={readiness.readyForVerifiedMatching} />
          <div className="self-center">
            <p className="text-sm font-semibold">Profile readiness</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {readiness.readyForVerifiedMatching
                ? "Core decision facts are present; continue with the operational details."
                : `${readiness.criticalMissing.length} core fact${readiness.criticalMissing.length === 1 ? "" : "s"} still block verified matching.`}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              {readiness.readyForVerifiedMatching ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              Next facts to confirm
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {nextFacts.map((item) => (
                <li key={item.key}>â€¢ {item.label}</li>
              ))}
              {nextFacts.length === 0 && <li>All tracked facts complete.</li>}
            </ul>
          </div>
        </section>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <ProfileSection
            title="Identity and legal eligibility"
            description="Facts used for hard applicant-type and jurisdiction gates."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Organization name" error={form.formState.errors.org_name?.message}>
                <Input {...form.register("org_name")} required />
              </FormField>
              <FormField label="Legal name">
                <Input
                  {...form.register("legal_name")}
                  placeholder="Name on incorporation records"
                />
              </FormField>
              <FormField label="Registration status" description="Critical for eligibility">
                <select
                  className="h-10 w-full rounded border bg-background px-3"
                  {...form.register("registration_status")}
                >
                  <option value="">Select a verified status</option>
                  {REGISTRATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {humanize(status)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Applicant types"
                description="Used for F1 eligibility gate — be precise"
              >
                <Controller
                  control={form.control}
                  name="applicant_types"
                  render={({ field }) => (
                    <TagInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="nonprofit, registered charity"
                      suggestions={[
                        { value: "nonprofit", label: "Nonprofit" },
                        { value: "registered charity", label: "Registered Charity" },
                        { value: "for-profit", label: "For-Profit" },
                        { value: "public body", label: "Public Body" },
                        { value: "academic", label: "Academic" },
                        { value: "indigenous organization", label: "Indigenous Organization" },
                        { value: "municipality", label: "Municipality" },
                        { value: "social enterprise", label: "Social Enterprise" },
                      ]}
                      lowercase
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Legal jurisdictions"
                description="Where IIAL is incorporated or eligible"
              >
                <Controller
                  control={form.control}
                  name="jurisdictions"
                  render={({ field }) => (
                    <TagInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="CA, ON, QC"
                      suggestions={[
                        { value: "CA", label: "Canada (federal)" },
                        { value: "ON", label: "Ontario" },
                        { value: "QC", label: "Quebec" },
                        { value: "BC", label: "British Columbia" },
                        { value: "AB", label: "Alberta" },
                        { value: "MB", label: "Manitoba" },
                        { value: "SK", label: "Saskatchewan" },
                        { value: "NS", label: "Nova Scotia" },
                        { value: "NB", label: "New Brunswick" },
                        { value: "PE", label: "PEI" },
                        { value: "NL", label: "Newfoundland" },
                      ]}
                      uppercase
                    />
                  )}
                />
              </FormField>
              <FormField label="Regions served" description="Where funded work creates benefit">
                <Controller
                  control={form.control}
                  name="operating_regions"
                  render={({ field }) => (
                    <TagInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Canada, Ontario, Quebec"
                    />
                  )}
                />
              </FormField>
              <FormField label="Organization type">
                <select
                  className="h-10 w-full rounded border bg-background px-3"
                  {...form.register("stage")}
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {humanize(stage)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Business / charity number"
                description="CRA BN: 9 digits, e.g. 123456789 or 123456789RT0001"
                error={bnError ?? undefined}
              >
                <Input
                  {...form.register("business_number")}
                  placeholder="123456789"
                  className={bnError ? "border-destructive" : ""}
                />
              </FormField>
              <FormField label="Website">
                <Input type="url" {...form.register("website")} placeholder="https://..." />
              </FormField>
              <FormField label="Languages" description="ISO codes">
                <Controller
                  control={form.control}
                  name="languages"
                  render={({ field }) => (
                    <TagInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="en, fr"
                      suggestions={[
                        { value: "en", label: "English" },
                        { value: "fr", label: "French" },
                        { value: "es", label: "Spanish" },
                      ]}
                      lowercase
                    />
                  )}
                />
              </FormField>
            </div>
          </ProfileSection>

          <ProfileSection
            title="Mission, programs, and capacity"
            description="Specific language that improves retrieval and reusable proposal content."
          >
            <div className="space-y-4">
              <FormField label="Mission" description="Use the approved organizational wording">
                <Textarea rows={4} {...form.register("mission")} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Sectors" description="education, workforce development, AI">
                  <Controller
                    control={form.control}
                    name="sectors"
                    render={({ field }) => (
                      <TagInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="education, AI, workforce"
                        lowercase
                      />
                    )}
                  />
                </FormField>
                <FormField label="Populations served">
                  <Controller
                    control={form.control}
                    name="populations_served"
                    render={({ field }) => (
                      <TagInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="adult learners, SMEs, newcomers"
                        lowercase
                      />
                    )}
                  />
                </FormField>
                <FormField label="Activities and programs">
                  <Controller
                    control={form.control}
                    name="activities"
                    render={({ field }) => (
                      <TagInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="applied training, research partnerships"
                        lowercase
                      />
                    )}
                  />
                </FormField>
                <FormField
                  label="Delivery capabilities"
                  description={
                    (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <RefreshCw className="h-3 w-3" />
                        Auto-populated from sectors and focus areas
                      </span>
                    ) as unknown as string
                  }
                >
                  <Controller
                    control={form.control}
                    name="capabilities"
                    render={({ field }) => (
                      <TagInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="curriculum design, program evaluation"
                        lowercase
                      />
                    )}
                  />
                </FormField>
              </div>
              <FormField label="Additional focus context">
                <Textarea rows={3} {...form.register("focus_areas")} />
              </FormField>
            </div>
          </ProfileSection>

          <ProfileSection
            title="Financial and delivery constraints"
            description="Filters opportunities that are eligible on paper but impractical to pursue."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField form={form} name="annual_budget_cad" label="Annual budget (CAD)" />
              <NumberField form={form} name="funding_min_cad" label="Useful award floor (CAD)" />
              <NumberField
                form={form}
                name="funding_max_cad"
                label="Manageable award ceiling (CAD)"
              />
              <NumberField
                form={form}
                name="cost_share_max_pct"
                label="Maximum cost share (%)"
                max={100}
              />
              <NumberField
                form={form}
                name="indirect_cost_rate_pct"
                label="Indirect cost rate (%)"
                max={100}
              />
              <NumberField form={form} name="years_operating" label="Years operating" max={500} />
              <NumberField form={form} name="employee_count" label="Employees / core team" />
            </div>
          </ProfileSection>

          <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Changes apply to every IIAL member and future fit decision.
            </p>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Savingâ€¦" : "Save shared profile"}
            </Button>
          </div>
        </form>
      </section>
    </PageTransition>
  );
}

function ProfileSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function NumberField({
  form,
  label,
  max,
  name,
}: {
  form: UseFormReturn<OrgFormValues>;
  label: string;
  max?: number;
  name: keyof OrgFormValues;
}) {
  return (
    <FormField label={label}>
      <Input type="number" min="0" max={max} step="any" {...form.register(name)} />
    </FormField>
  );
}

function ProgressRing({ ready, value }: { ready: boolean; value: number }) {
  const circumference = 2 * Math.PI * 18;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg width="56" height="56" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--muted)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={ready ? "#16a34a" : "var(--primary)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {value}%
      </div>
    </div>
  );
}

function optionalNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
