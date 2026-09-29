import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  Users,
  Target,
  Tag,
  Globe,
  FileText,
  Shield,
} from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clients/$orgId/info")({
  component: ClientInfoTab,
});

function ClientInfoTab() {
  const { t } = useTranslation();
  const { organization, profile, membership } = Route.useContext();

  if (!profile) {
    return (
      <div className="rounded-xl border bg-card/50 p-8 text-center">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 font-semibold">{t("clients.info.noProfileTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("clients.info.noProfileDescription")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main profile info */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("clients.info.organizationDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailRow label={t("org.name")} value={organization.name} icon={Building2} />
            <DetailRow label={t("clients.info.slug")} value={organization.slug} icon={Tag} />
            <DetailRow
              label={t("clients.info.created")}
              value={format(new Date(organization.created_at), "PPP")}
              icon={Calendar}
            />
            <DetailRow
              label={t("clients.info.role")}
              value={<Badge>{t(`clients.roles.${membership}`)}</Badge>}
              icon={Shield}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("clients.info.grantReadinessProfile")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailRow
              label={t("org.sectors")}
              value={profile.sectors?.join(", ") || t("app.none")}
              icon={Target}
            />
            <DetailRow
              label={t("org.jurisdictions")}
              value={profile.jurisdictions?.join(", ") || "CA"}
              icon={Globe}
            />
            <DetailRow
              label={t("org.stage")}
              value={t(`org.stages.${profile.stage}`)}
              icon={Users}
            />
            <DetailRow
              label={t("org.budget")}
              value={
                profile.annual_budget_cad
                  ? `$${profile.annual_budget_cad.toLocaleString()} CAD`
                  : t("app.none")
              }
              icon={DollarSign}
            />
            <DetailRow
              label={t("org.focus")}
              value={profile.focus_areas || t("app.none")}
              icon={FileText}
            />
            <DetailRow
              label={t("clients.info.legalName")}
              value={profile.legal_name || t("app.none")}
              icon={FileText}
            />
            <DetailRow
              label={t("clients.info.businessNumber")}
              value={profile.business_number || t("app.none")}
              icon={Shield}
            />
            <DetailRow
              label={t("clients.info.website")}
              value={profile.website || t("app.none")}
              icon={Globe}
            />
            <DetailRow
              label={t("clients.info.mission")}
              value={profile.mission || t("app.none")}
              icon={Target}
            />
            <DetailRow
              label={t("clients.info.applicantTypes")}
              value={profile.applicant_types?.join(", ") || t("app.none")}
              icon={Users}
            />
            <DetailRow
              label={t("clients.info.activities")}
              value={profile.activities?.join(", ") || t("app.none")}
              icon={Target}
            />
            <DetailRow
              label={t("clients.info.capabilities")}
              value={profile.capabilities?.join(", ") || t("app.none")}
              icon={Target}
            />
            <DetailRow
              label={t("clients.info.populationsServed")}
              value={profile.populations_served?.join(", ") || t("app.none")}
              icon={Users}
            />
            <DetailRow
              label={t("clients.info.operatingRegions")}
              value={profile.operating_regions?.join(", ") || t("app.none")}
              icon={Globe}
            />
            <DetailRow
              label={t("clients.info.languages")}
              value={profile.languages?.join(", ") || t("app.none")}
              icon={Globe}
            />
            <DetailRow
              label={t("clients.info.yearsOperating")}
              value={
                profile.years_operating
                  ? `${profile.years_operating} ${t("clients.info.years")}`
                  : t("app.none")
              }
              icon={Calendar}
            />
            <DetailRow
              label={t("clients.info.employeeCount")}
              value={
                profile.employee_count
                  ? `${profile.employee_count.toLocaleString()}`
                  : t("app.none")
              }
              icon={Users}
            />
            <DetailRow
              label={t("clients.info.registrationStatus")}
              value={
                profile.registration_status
                  ? profile.registration_status.replace(/_/g, " ")
                  : t("app.none")
              }
              icon={Shield}
            />
            <DetailRow
              label={t("clients.info.fundingMin")}
              value={
                profile.funding_min_cad
                  ? `$${profile.funding_min_cad.toLocaleString()} CAD`
                  : t("app.none")
              }
              icon={DollarSign}
            />
            <DetailRow
              label={t("clients.info.fundingMax")}
              value={
                profile.funding_max_cad
                  ? `$${profile.funding_max_cad.toLocaleString()} CAD`
                  : t("app.none")
              }
              icon={DollarSign}
            />
            <DetailRow
              label={t("clients.info.costShareMax")}
              value={profile.cost_share_max_pct ? `${profile.cost_share_max_pct}%` : t("app.none")}
              icon={DollarSign}
            />
            <DetailRow
              label={t("clients.info.indirectCostRate")}
              value={
                profile.indirect_cost_rate_pct
                  ? `${profile.indirect_cost_rate_pct}%`
                  : t("app.none")
              }
              icon={DollarSign}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar - completeness & actions */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("clients.info.profileCompleteness")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CompletenessIndicator profile={profile} />
            <div className="text-sm text-muted-foreground">
              {t("clients.info.completenessHint")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("clients.info.quickActions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ActionButton
              label={t("clients.info.editProfile")}
              href={`/org`}
              icon={FileText}
              description={t("clients.info.editProfileDesc")}
            />
            <ActionButton
              label={t("clients.info.viewGrants")}
              href={`/clients/${organization.id}/grants`}
              icon={Target}
              description={t("clients.info.viewGrantsDesc")}
            />
            <ActionButton
              label={t("clients.info.manageTeam")}
              href={`/clients/${organization.id}/team`}
              icon={Users}
              description={t("clients.info.manageTeamDesc")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function CompletenessIndicator({ profile }: { profile: Record<string, unknown> }) {
  const fields = [
    { key: "org_name", label: "Name" },
    { key: "sectors", label: "Sectors" },
    { key: "jurisdictions", label: "Jurisdictions" },
    { key: "stage", label: "Stage" },
    { key: "annual_budget_cad", label: "Budget" },
    { key: "focus_areas", label: "Focus" },
    { key: "legal_name", label: "Legal name" },
    { key: "business_number", label: "Business #" },
    { key: "mission", label: "Mission" },
    { key: "applicant_types", label: "Applicant types" },
    { key: "registration_status", label: "Reg. status" },
    { key: "funding_min_cad", label: "Funding min" },
    { key: "funding_max_cad", label: "Funding max" },
  ];

  const filled = fields.filter((f) => {
    const v = profile[f.key];
    return v !== null && v !== undefined && v !== "" && (Array.isArray(v) ? v.length > 0 : true);
  }).length;

  const pct = Math.round((filled / fields.length) * 100);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t("clients.info.completeness")}</span>
        <span className="text-sm font-bold tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 80 ? "#16a34a" : pct >= 50 ? "#ca8a04" : "#dc2626",
          }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {filled} of {fields.length} fields completed
      </p>
    </div>
  );
}

function ActionButton({
  label,
  href,
  icon: Icon,
  description,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </a>
  );
}
