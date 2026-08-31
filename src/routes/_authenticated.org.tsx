import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useForm, type UseFormProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { getOrgProfile, saveOrgProfile } from "@/lib/org.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { syncClientLocale } from "@/i18n/sync";
import { toast } from "sonner";
import { FormField } from "@/components/FormField";
import { AppTopBar } from "@/components/AppSidebar";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { useUiVersion } from "@/components/v2/ui-version";
import { PageTransition } from "@/components/PageTransition";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { computeOrgProfileReadiness } from "@/lib/org-profile-readiness";
import "@/i18n";

const orgQueryOptions = queryOptions({
  queryKey: ["org", "self"],
  queryFn: () => getOrgProfile(),
});

export const Route = createFileRoute("/_authenticated/org")({
  head: () => ({ meta: [{ title: "Organization — IIAL" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(orgQueryOptions),
  component: OrgPage,
});

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

const orgSchema = z.object({
  org_name: z.string().min(1, "Organization name is required"),
  sectors: z.string().optional().default(""),
  jurisdictions: z.string().optional().default("CA"),
  stage: z.enum(STAGES).default("sme"),
  annual_budget_cad: z.string().optional().default(""),
  focus_areas: z.string().optional().default(""),
  legal_name: z.string().optional().default(""),
  business_number: z.string().optional().default(""),
  website: z.string().optional().default(""),
  mission: z.string().optional().default(""),
  applicant_types: z.string().optional().default(""),
  activities: z.string().optional().default(""),
  capabilities: z.string().optional().default(""),
  populations_served: z.string().optional().default(""),
  operating_regions: z.string().optional().default(""),
  languages: z.string().optional().default("en, fr"),
  years_operating: z.string().optional().default(""),
  employee_count: z.string().optional().default(""),
  registration_status: z.enum(REGISTRATION_STATUSES).optional(),
  funding_min_cad: z.string().optional().default(""),
  funding_max_cad: z.string().optional().default(""),
  cost_share_max_pct: z.string().optional().default(""),
  indirect_cost_rate_pct: z.string().optional().default(""),
});

type OrgFormValues = z.infer<typeof orgSchema>;

function OrgPage() {
  const { t } = useTranslation();
  const { version } = useUiVersion();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(orgQueryOptions);
  const save = useServerFn(saveOrgProfile);
  const mut = useMutation({
    mutationFn: (input: {
      org_name: string;
      sectors: string[];
      jurisdictions: string[];
      stage: (typeof STAGES)[number];
      annual_budget_cad: number | null;
      focus_areas: string | null;
      legal_name: string | null;
      business_number: string | null;
      website: string | null;
      mission: string | null;
      applicant_types: string[];
      activities: string[];
      capabilities: string[];
      populations_served: string[];
      operating_regions: string[];
      languages: string[];
      years_operating: number | null;
      employee_count: number | null;
      registration_status: (typeof REGISTRATION_STATUSES)[number] | null;
      funding_min_cad: number | null;
      funding_max_cad: number | null;
      cost_share_max_pct: number | null;
      indirect_cost_rate_pct: number | null;
    }) => save({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org"] });
      toast.success(t("org.saved"));
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  useEffect(() => {
    syncClientLocale();
  }, []);

  const p = data.profile;

  const form = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema) as unknown as UseFormProps<OrgFormValues>["resolver"],
    defaultValues: {
      org_name: p?.org_name ?? "",
      sectors: (p?.sectors ?? []).join(", "),
      jurisdictions: (p?.jurisdictions ?? ["CA"]).join(", "),
      stage: ((p?.stage as (typeof STAGES)[number]) ?? "sme") as OrgFormValues["stage"],
      annual_budget_cad: p?.annual_budget_cad?.toString() ?? "",
      focus_areas: p?.focus_areas ?? "",
      legal_name: p?.legal_name ?? "",
      business_number: p?.business_number ?? "",
      website: p?.website ?? "",
      mission: p?.mission ?? "",
      applicant_types: (p?.applicant_types ?? []).join(", "),
      activities: (p?.activities ?? []).join(", "),
      capabilities: (p?.capabilities ?? []).join(", "),
      populations_served: (p?.populations_served ?? []).join(", "),
      operating_regions: (p?.operating_regions ?? []).join(", "),
      languages: (p?.languages ?? ["en", "fr"]).join(", "),
      years_operating: p?.years_operating?.toString() ?? "",
      employee_count: p?.employee_count?.toString() ?? "",
      registration_status:
        (p?.registration_status as (typeof REGISTRATION_STATUSES)[number] | null) ?? undefined,
      funding_min_cad: p?.funding_min_cad?.toString() ?? "",
      funding_max_cad: p?.funding_max_cad?.toString() ?? "",
      cost_share_max_pct: p?.cost_share_max_pct?.toString() ?? "",
      indirect_cost_rate_pct: p?.indirect_cost_rate_pct?.toString() ?? "",
    },
  });

  const onSubmit = (values: OrgFormValues) => {
    mut.mutate({
      org_name: values.org_name,
      sectors: csv(values.sectors),
      jurisdictions: csv(values.jurisdictions).map((value) => value.toUpperCase()),
      stage: values.stage,
      annual_budget_cad: optionalNumber(values.annual_budget_cad),
      focus_areas: values.focus_areas || null,
      legal_name: values.legal_name || null,
      business_number: values.business_number || null,
      website: values.website || null,
      mission: values.mission || null,
      applicant_types: csv(values.applicant_types),
      activities: csv(values.activities),
      capabilities: csv(values.capabilities),
      populations_served: csv(values.populations_served),
      operating_regions: csv(values.operating_regions),
      languages: csv(values.languages).map((value) => value.toLowerCase()),
      years_operating: optionalNumber(values.years_operating),
      employee_count: optionalNumber(values.employee_count),
      registration_status: values.registration_status ?? null,
      funding_min_cad: optionalNumber(values.funding_min_cad),
      funding_max_cad: optionalNumber(values.funding_max_cad),
      cost_share_max_pct: optionalNumber(values.cost_share_max_pct),
      indirect_cost_rate_pct: optionalNumber(values.indirect_cost_rate_pct),
    });
  };

  if (version === "v2") {
    return <OrgPageV2 form={form} mut={mut} onSubmit={onSubmit} t={t} />;
  }

  return (
    <div className="min-h-screen text-foreground">
      <AppTopBar title={t("org.title")} />
      <PageContainer size="form">
        <PageHeader
          eyebrow="Workspace"
          title={t("org.title")}
          description="Sectors, jurisdictions, and budget let the system score grants against who you actually are — not generic defaults."
        />
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField label={t("org.name")} error={form.formState.errors.org_name?.message}>
                <Input {...form.register("org_name")} required />
              </FormField>
              <FormField label={t("org.sectors")} description="Comma-separated: tech, retail">
                <Input {...form.register("sectors")} placeholder="tech, retail" />
              </FormField>
              <FormField
                label={t("org.jurisdictions")}
                description="Any country or region — comma-separated. Not limited to Canada: CA, ON, US, FR..."
              >
                <Input {...form.register("jurisdictions")} placeholder="CA, ON, US, FR" />
              </FormField>
              <FormField label={t("org.stage")}>
                <select
                  className="w-full border rounded h-10 px-3 bg-background"
                  {...form.register("stage")}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {t(`org.stages.${s}`)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t("org.budget")}>
                <Input type="number" min="0" {...form.register("annual_budget_cad")} />
              </FormField>
              <FormField label={t("org.focus")}>
                <Textarea rows={3} {...form.register("focus_areas")} />
              </FormField>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? t("app.loading") : t("org.save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </PageContainer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// V2 — friendly redesign (presentation only; same form/mutation as v1)
// -----------------------------------------------------------------------------

function OrgPageV2({
  form,
  mut,
  onSubmit,
  t,
}: {
  form: ReturnType<typeof useForm<OrgFormValues>>;
  mut: { isPending: boolean };
  onSubmit: (values: OrgFormValues) => void;
  t: (key: string) => string;
}) {
  const values = form.watch();
  const fields: Array<{ label: string; filled: boolean }> = [
    { label: "Organization name", filled: !!values.org_name },
    { label: "Sectors", filled: !!values.sectors },
    { label: "Jurisdictions", filled: !!values.jurisdictions },
    { label: "Focus areas", filled: !!values.focus_areas },
    { label: "Annual budget", filled: !!values.annual_budget_cad },
  ];
  const completePct = Math.round((fields.filter((f) => f.filled).length / fields.length) * 100);

  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <section className="mx-auto max-w-[720px] space-y-5 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">About us</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This is what we use to match you to grants — the more complete, the better the match.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-xl border bg-card p-5">
            <div className="relative h-14 w-14 shrink-0">
              <svg width="56" height="56" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--muted)" strokeWidth="4" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke={completePct >= 80 ? "#16a34a" : "var(--primary)"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(completePct / 100) * 2 * Math.PI * 18} ${2 * Math.PI * 18}`}
                  transform="rotate(-90 22 22)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
                {completePct}%
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Profile completeness</p>
              <p className="text-sm text-muted-foreground">
                {completePct >= 100
                  ? "Your profile is complete."
                  : "Fill in the fields below so grant matches reflect who you really are."}
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  label="Organization name"
                  error={form.formState.errors.org_name?.message}
                >
                  <Input {...form.register("org_name")} required />
                </FormField>
                <FormField label="Sectors" description="Comma-separated: tech, retail">
                  <Input {...form.register("sectors")} placeholder="tech, retail" />
                </FormField>
                <FormField
                  label="Where you operate"
                  description="Any country or region — comma-separated. Not limited to Canada: CA, ON, US, FR..."
                >
                  <Input {...form.register("jurisdictions")} placeholder="CA, ON, US, FR" />
                </FormField>
                <FormField label="Organization type">
                  <select
                    className="h-10 w-full rounded border bg-background px-3"
                    {...form.register("stage")}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {t(`org.stages.${s}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Annual budget (CAD)">
                  <Input type="number" min="0" {...form.register("annual_budget_cad")} />
                </FormField>
                <FormField label="What you focus on">
                  <Textarea rows={3} {...form.register("focus_areas")} />
                </FormField>
                <Button type="submit" disabled={mut.isPending}>
                  {mut.isPending ? "Saving…" : "Save profile"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
