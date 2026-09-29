import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { listGrantsForOrganization } from "@/lib/clients.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Target,
  Calendar,
  DollarSign,
  Building2,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/_authenticated/clients/$orgId/grants")({
  component: ClientGrantsTab,
});

const grantsQueryOptions = (
  orgId: string,
  params: { status?: string; minFitScore?: number; search?: string },
) =>
  queryOptions({
    queryKey: ["clients", "grants", orgId, params],
    queryFn: () => listGrantsForOrganization({ orgId, ...params }),
    enabled: !!orgId,
  });

function ClientGrantsTab() {
  const { t } = useTranslation();
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(grantsQueryOptions(orgId, {}));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minFitScore, setMinFitScore] = useState<number | undefined>(undefined);
  const [sortKey, setSortKey] = useState<"fit" | "deadline" | "amount" | "relevance">("fit");
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");

  const grants = data?.grants ?? [];

  // Filter grants client-side for search
  const filteredGrants = useMemo(() => {
    let result = grants;

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (g) =>
          g.title?.toLowerCase().includes(term) ||
          g.summary?.toLowerCase().includes(term) ||
          g.funder?.name?.toLowerCase().includes(term) ||
          g.sectors?.some((s) => s.toLowerCase().includes(term)),
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((g) => g.status === statusFilter);
    }

    if (minFitScore !== undefined) {
      result = result.filter((g) => (g.evaluation?.fit_score ?? 0) >= minFitScore);
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "fit":
          return (b.evaluation?.fit_score ?? 0) - (a.evaluation?.fit_score ?? 0);
        case "deadline":
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case "amount":
          return (
            (b.amount_cad_max ?? b.amount_cad_min ?? 0) -
            (a.amount_cad_max ?? a.amount_cad_min ?? 0)
          );
        case "relevance":
          return (b.evaluation?.fit_score ?? 0) - (a.evaluation?.fit_score ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [grants, search, statusFilter, minFitScore, sortKey]);

  const uniqueStatuses = useMemo(() => [...new Set(grants.map((g) => g.status))].sort(), [grants]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("clients.grants.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("clients.grants.statusFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clients.grants.allStatuses")}</SelectItem>
              {uniqueStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`grants.status.${s}`) || s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={minFitScore?.toString() ?? "all"}
            onValueChange={(v) => setMinFitScore(v === "all" ? undefined : Number(v))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("clients.grants.minFitScore")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clients.grants.allScores")}</SelectItem>
              <SelectItem value="80">{t("clients.grants.fit80plus")}</SelectItem>
              <SelectItem value="60">{t("clients.grants.fit60plus")}</SelectItem>
              <SelectItem value="40">{t("clients.grants.fit40plus")}</SelectItem>
              <SelectItem value="20">{t("clients.grants.fit20plus")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("clients.grants.sortBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">{t("clients.grants.sortFit")}</SelectItem>
              <SelectItem value="deadline">{t("clients.grants.sortDeadline")}</SelectItem>
              <SelectItem value="amount">{t("clients.grants.sortAmount")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border rounded-lg bg-background">
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("cards")}
              aria-label={t("clients.grants.cardsView")}
            >
              <div className="grid grid-cols-2 gap-1 p-1">
                <div className="h-3 w-full bg-primary/20 rounded" />
                <div className="h-3 w-full bg-primary/20 rounded" />
                <div className="h-3 w-full bg-primary/20 rounded" />
                <div className="h-3 w-full bg-primary/20 rounded" />
              </div>
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("table")}
              aria-label={t("clients.grants.tableView")}
            >
              <div className="grid grid-cols-4 gap-1 p-1">
                <div className="h-3 w-full bg-primary/20 rounded" />
                <div className="h-3 w-full bg-primary/20 rounded" />
                <div className="h-3 w-full bg-primary/20 rounded" />
                <div className="h-3 w-full bg-primary/20 rounded" />
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {filteredGrants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 font-semibold">{t("clients.grants.noResults")}</h3>
            <p className="text-sm text-muted-foreground">{t("clients.grants.noResultsDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("clients.grants.showing", { count: filteredGrants.length, total: grants.length })}
          </p>
          {viewMode === "cards" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGrants.map((grant) => (
                <GrantCard key={grant.id} grant={grant} />
              ))}
            </div>
          ) : (
            <GrantTable grants={filteredGrants} />
          )}
        </>
      )}
    </div>
  );
}

function GrantCard({ grant }: { grant: any }) {
  const { t } = useTranslation();
  const fitScore = grant.evaluation?.fit_score ?? null;
  const deadline = grant.deadline ? new Date(grant.deadline) : null;
  const daysLeft = deadline ? differenceInDays(deadline, new Date()) : null;
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{grant.title}</h3>
            <p className="text-sm text-muted-foreground truncate">{grant.funder?.name}</p>
          </div>
          {fitScore !== null && (
            <Badge
              className={`shrink-0 ${fitScore >= 70 ? "bg-green-100 text-green-800" : fitScore >= 40 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
            >
              {t("clients.grants.fitScore", { score: fitScore })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-3 pt-0">
        {grant.summary && <p className="text-sm line-clamp-2">{grant.summary}</p>}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {grant.amount_cad_max && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />${grant.amount_cad_min?.toLocaleString()}–$
              {grant.amount_cad_max.toLocaleString()} CAD
            </span>
          )}
          {grant.sectors?.length && (
            <span className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              {grant.sectors.slice(0, 2).join(", ")}
              {grant.sectors.length > 2 ? "…" : ""}
            </span>
          )}
        </div>

        {deadline && (
          <div
            className={`flex items-center gap-1 text-xs ${isUrgent ? "text-destructive" : "text-muted-foreground"}`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {daysLeft !== null && daysLeft >= 0 ? (
              <>
                {t("clients.grants.daysLeft", { days: daysLeft })}
                {isUrgent && <span className="ml-1">⚠</span>}
              </>
            ) : daysLeft !== null && daysLeft < 0 ? (
              t("clients.grants.expired")
            ) : (
              format(deadline, "PPP")
            )}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <a href={`/grants/${grant.id}`}>{t("clients.grants.viewDetails")}</a>
          </Button>
          {grant.evaluation?.eligibility_pass === false && (
            <Badge variant="destructive" className="text-xs">
              {t("clients.grants.notEligible")}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GrantTable({ grants }: { grants: any[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left font-medium">{t("clients.grants.grant")}</th>
                <th className="p-3 text-left font-medium hidden md:table-cell">
                  {t("clients.grants.funder")}
                </th>
                <th className="p-3 text-left font-medium hidden lg:table-cell">
                  {t("clients.grants.fit")}
                </th>
                <th className="p-3 text-left font-medium hidden md:table-cell">
                  {t("clients.grants.amount")}
                </th>
                <th className="p-3 text-left font-medium">{t("clients.grants.deadline")}</th>
                <th className="p-3 text-left font-medium">{t("clients.grants.status")}</th>
                <th className="p-3 text-right font-medium">{t("clients.grants.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {grants.map((grant) => (
                <tr key={grant.id} className="hover:bg-muted/30">
                  <td className="p-3">
                    <div>
                      <a href={`/grants/${grant.id}`} className="font-medium hover:underline">
                        {grant.title}
                      </a>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">
                        {grant.summary}
                      </p>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell">{grant.funder?.name}</td>
                  <td className="p-3 hidden lg:table-cell">
                    {grant.evaluation?.fit_score !== null ? (
                      <Badge
                        className={
                          grant.evaluation.fit_score >= 70
                            ? "bg-green-100 text-green-800"
                            : grant.evaluation.fit_score >= 40
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }
                      >
                        {grant.evaluation.fit_score}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    {grant.amount_cad_max ? (
                      `$${grant.amount_cad_min?.toLocaleString() ?? 0}–${grant.amount_cad_max.toLocaleString()}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {grant.deadline ? (
                      <>
                        {format(new Date(grant.deadline), "PPP")}
                        {grant.evaluation?.fit_score !== null && (
                          <div className="text-xs text-muted-foreground">
                            {differenceInDays(new Date(grant.deadline), new Date()) >= 0
                              ? t("clients.grants.daysLeft", {
                                  days: differenceInDays(new Date(grant.deadline), new Date()),
                                })
                              : t("clients.grants.expired")}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">
                      {t(`grants.status.${grant.status}`) || grant.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/grants/${grant.id}`}>{t("clients.grants.view")}</a>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
