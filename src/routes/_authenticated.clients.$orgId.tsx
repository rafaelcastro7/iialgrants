import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { getClientOrganization, switchOrganizationContext } from "@/lib/clients.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppTopBar } from "@/components/AppSidebar";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Building2, Users, FolderOpen, FileText, Send, Trophy, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clients/$orgId")({
  head: () => ({
    meta: [{ title: "Client Detail — IIAL" }],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(clientQueryOptions(params.orgId)),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
  component: ClientLayout,
});

const clientQueryOptions = (orgId: string) =>
  queryOptions({
    queryKey: ["clients", "detail", orgId],
    queryFn: () => getClientOrganization({ orgId }),
  });

function ClientLayout() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(clientQueryOptions(Route.useParams().orgId));
  const switchOrg = useServerFn(switchOrganizationContext);
  const { organization, profile, membership, stats } = data;

  const handleSwitchContext = async () => {
    try {
      await switchOrg({ data: { orgId: organization.id } });
      toast.success(t("clients.contextSwitched"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <AppTopBar title={organization.name} />
        <PageContainer size="wide">
          {/* Client header with context switch */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link to="/clients" className="p-2 hover:bg-accent rounded-lg transition-colors" title={t("clients.backToList")}>
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div>
                <p className="text-sm text-muted-foreground">{t("clients.client")}</p>
                <h1 className="font-display text-2xl font-bold">{organization.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={membership === "owner" ? "default" : "outline"}>
                {t(`clients.roles.${membership}`)}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleSwitchContext} className="gap-2">
                <Building2 className="h-4 w-4" />
                {t("clients.setAsContext")}
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label={t("clients.stats.members")} value={stats.memberCount} />
            <StatCard icon={FolderOpen} label={t("clients.stats.grants")} value={stats.grantsCount} />
            <StatCard icon={FileText} label={t("clients.stats.proposals")} value={stats.proposalsCount} />
            <StatCard icon={Send} label={t("clients.stats.submissions")} value={stats.submissionsCount} />
          </div>

          {/* Tabs for Info / Grants */}
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">
                <Building2 className="mr-2 h-4 w-4" />
                {t("clients.tabs.info")}
              </TabsTrigger>
              <TabsTrigger value="grants">
                <FileText className="mr-2 h-4 w-4" />
                {t("clients.tabs.grants")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-4">
              <Outlet context={{ organization, profile, membership }} />
            </TabsContent>
            <TabsContent value="grants" className="mt-4">
              <Outlet context={{ organization, membership }} />
            </TabsContent>
          </Tabs>
        </PageContainer>
      </div>
    </PageTransition>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}