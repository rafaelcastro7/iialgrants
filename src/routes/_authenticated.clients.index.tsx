import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { listUserOrganizations, createOrganization } from "@/lib/clients.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Users, FolderOpen, ChevronRight, Loader2 } from "lucide-react";
import { AppTopBar } from "@/components/AppSidebar";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";

const orgsQueryOptions = queryOptions({
  queryKey: ["clients", "list"],
  queryFn: () => listUserOrganizations(),
});

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — IIAL" },
      {
        name: "description",
        content: "Manage client organizations and their grant opportunities.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(orgsQueryOptions),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
  component: ClientsPage,
});

const createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens")
    .optional(),
});

type CreateOrgForm = z.infer<typeof createOrgSchema>;

function ClientsPage() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(orgsQueryOptions);
  const createOrg = useServerFn(createOrganization);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const form = useForm<CreateOrgForm>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "", slug: "" },
  });

  const onSubmit = (values: CreateOrgForm) => {
    createOrg({ data: values })
      .then(() => {
        toast.success(t("clients.created"));
        setIsCreateOpen(false);
        form.reset();
      })
      .catch((e) => toast.error(e.message));
  };

  const organizations = data.organizations ?? [];

  return (
    <PageTransition>
      <div className="min-h-screen text-foreground">
        <AppTopBar title={t("clients.title")} />
        <PageContainer size="wide">
          <PageHeader
            eyebrow="Workspace"
            title={t("clients.title")}
            description={t("clients.description")}
            actions={
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("clients.addClient")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t("clients.addClient")}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t("clients.name")}</Label>
                      <Input id="name" {...form.register("name")} placeholder="Acme Foundation" />
                      {form.formState.errors.name && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.name.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slug">{t("clients.slug")}</Label>
                      <Input id="slug" {...form.register("slug")} placeholder="acme-foundation" />
                      <p className="text-xs text-muted-foreground">{t("clients.slugHint")}</p>
                      {form.formState.errors.slug && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.slug.message}
                        </p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createOrg.isPending}>
                        {createOrg.isPending ? t("app.loading") : t("clients.create")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            }
          />

          {organizations.length === 0 ? (
            <div className="rounded-2xl border border-border/70 bg-card/90 p-10 text-center shadow-sm">
              <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 font-display text-2xl text-foreground">
                {t("clients.emptyTitle")}
              </h2>
              <p className="mx-auto mb-6 max-w-xl text-sm text-muted-foreground">
                {t("clients.emptyDescription")}
              </p>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                {t("clients.addFirstClient")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {organizations.map((org) => (
                <ClientCard key={org.id} org={org} userRole={org.user_role} />
              ))}
            </div>
          )}
        </PageContainer>
      </div>
    </PageTransition>
  );
}

interface ClientCardProps {
  org: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
  };
  userRole: string;
}

function ClientCard({ org, userRole }: ClientCardProps) {
  const { t } = useTranslation();

  return (
    <Link to={`/clients/${org.id}`} className="block">
      <Card className="h-full transition-shadow hover:shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">{org.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{org.slug}</p>
              </div>
            </div>
            <Badge variant={userRole === "owner" ? "default" : "outline"}>
              {t(`clients.roles.${userRole}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Team</span>
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Grants</span>
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
