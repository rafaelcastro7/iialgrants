import type { UseFormReturn } from "react-hook-form";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { OrgFormValues } from "@/routes/_authenticated.org";
import { computeOrgProfileReadiness } from "@/lib/org-profile-readiness";
import { PageTransition } from "@/components/PageTransition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/FormField";

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
    sectors: csv(values.sectors),
    jurisdictions: csv(values.jurisdictions),
    applicant_types: csv(values.applicant_types),
    activities: csv(values.activities),
    capabilities: csv(values.capabilities),
    populations_served: csv(values.populations_served),
    operating_regions: csv(values.operating_regions),
    annual_budget_cad: optionalNumber(values.annual_budget_cad),
    funding_min_cad: optionalNumber(values.funding_min_cad),
    funding_max_cad: optionalNumber(values.funding_max_cad),
    cost_share_max_pct: optionalNumber(values.cost_share_max_pct),
  });

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
                description="Comma-separated; use formal categories"
              >
                <Input
                  {...form.register("applicant_types")}
                  placeholder="nonprofit, registered charity"
                />
              </FormField>
              <FormField
                label="Legal jurisdictions"
                description="Where IIAL is incorporated or eligible"
              >
                <Input {...form.register("jurisdictions")} placeholder="CA, ON, QC" />
              </FormField>
              <FormField label="Regions served" description="Where funded work can create benefit">
                <Input
                  {...form.register("operating_regions")}
                  placeholder="Canada, Ontario, Quebec"
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
              <FormField label="Business / charity number">
                <Input {...form.register("business_number")} />
              </FormField>
              <FormField label="Website">
                <Input type="url" {...form.register("website")} placeholder="https://..." />
              </FormField>
              <FormField label="Languages" description="Comma-separated ISO codes">
                <Input {...form.register("languages")} placeholder="en, fr" />
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
                  <Input {...form.register("sectors")} />
                </FormField>
                <FormField label="Populations served">
                  <Input
                    {...form.register("populations_served")}
                    placeholder="adult learners, SMEs"
                  />
                </FormField>
                <FormField label="Activities and programs">
                  <Textarea
                    rows={3}
                    {...form.register("activities")}
                    placeholder="applied training, research partnerships"
                  />
                </FormField>
                <FormField label="Delivery capabilities">
                  <Textarea
                    rows={3}
                    {...form.register("capabilities")}
                    placeholder="curriculum design, program evaluation"
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

function csv(value: string | undefined) {
  return (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
