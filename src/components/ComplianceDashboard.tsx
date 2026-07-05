import { useMemo } from "react";
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface ComplianceItem {
  id: string;
  name: string;
  category: string;
  status: "met" | "partial" | "not_met" | "not_applicable";
  notes?: string;
}

interface ComplianceDashboardProps {
  items: ComplianceItem[];
}

const STATUS_CONFIG = {
  met: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Met" },
  partial: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    label: "Partial",
  },
  not_met: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Not Met" },
  not_applicable: {
    icon: ShieldCheck,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "N/A",
  },
};

export function ComplianceDashboard({ items }: ComplianceDashboardProps) {
  const stats = useMemo(() => {
    const total = items.filter((i) => i.status !== "not_applicable").length;
    const met = items.filter((i) => i.status === "met").length;
    const partial = items.filter((i) => i.status === "partial").length;
    const notMet = items.filter((i) => i.status === "not_met").length;
    const percentage = total > 0 ? Math.round(((met + partial * 0.5) / total) * 100) : 0;
    return { total, met, partial, notMet, percentage };
  }, [items]);

  const grouped = useMemo(() => {
    const map: Record<string, ComplianceItem[]> = {};
    for (const item of items) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Compliance Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold">{stats.percentage}%</div>
            <Progress value={stats.percentage} className="h-3 flex-1" />
          </div>
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckCircle className="h-4 w-4" /> {stats.met} Met
            </span>
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="h-4 w-4" /> {stats.partial} Partial
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="h-4 w-4" /> {stats.notMet} Not Met
            </span>
          </div>
        </CardContent>
      </Card>

      {Object.entries(grouped).map(([category, catItems]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {catItems.map((item) => {
                const config = STATUS_CONFIG[item.status];
                const Icon = config.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full ${config.bg}`}
                      >
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground">{item.notes}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={item.status === "met" ? "default" : "secondary"}>
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
