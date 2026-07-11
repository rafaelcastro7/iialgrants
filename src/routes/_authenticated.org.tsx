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

const orgSchema = z.object({
  org_name: z.string().min(1, "Organization name is required"),
  sectors: z.string().optional().default(""),
  jurisdictions: z.string().optional().default("CA"),
  stage: z.enum(STAGES).default("sme"),
  annual_budget_cad: z.string().optional().default(""),
  focus_areas: z.string().optional().default(""),
});

type OrgFormValues = z.infer<typeof orgSchema>;

function OrgPage() {
  const { t } = useTranslation();
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
    },
  });

  const onSubmit = (values: OrgFormValues) => {
    mut.mutate({
      org_name: values.org_name,
      sectors: values.sectors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      jurisdictions: values.jurisdictions
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      stage: values.stage,
      annual_budget_cad: values.annual_budget_cad ? Number(values.annual_budget_cad) : null,
      focus_areas: values.focus_areas || null,
    });
  };

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
              <FormField label={t("org.jurisdictions")} description="Comma-separated: CA, ON">
                <Input {...form.register("jurisdictions")} placeholder="CA, ON" />
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
