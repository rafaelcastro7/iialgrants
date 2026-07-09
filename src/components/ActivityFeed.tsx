import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { FileText, Send, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface ActivityEvent {
  id: string;
  type:
    | "grant_created"
    | "proposal_submitted"
    | "proposal_approved"
    | "proposal_rejected"
    | "deadline_approaching";
  title: string;
  entity_id: string;
  entity_type: "grant" | "proposal";
  created_at: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  grant_created: <FileText className="h-4 w-4 text-blue-500" />,
  proposal_submitted: <Send className="h-4 w-4 text-purple-500" />,
  proposal_approved: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  proposal_rejected: <AlertTriangle className="h-4 w-4 text-red-500" />,
  deadline_approaching: <Clock className="h-4 w-4 text-amber-500" />,
};

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: async () => {
      // Grants are the shared catalog — "New grant discovered" is a legit
      // workspace-wide event. Proposals are user-owned artifacts, so this
      // personal feed MUST scope them to the current user: RLS currently lets
      // an org_id=NULL proposal be read by any authenticated user, which would
      // otherwise surface another user's proposal here (found by logging in as
      // demo-member-a and seeing the admin's PSCE proposal).
      const { data: grants } = await supabase
        .from("grants")
        .select("id, title, created_at")
        .order("created_at", { ascending: false })
        .limit(3);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const proposalQuery = supabase
        .from("proposals")
        .select("id, title, status, created_at, grant_id")
        .order("created_at", { ascending: false })
        .limit(5);
      const { data: proposals } = await (user
        ? proposalQuery.eq("user_id", user.id)
        : proposalQuery);

      const activityEvents: ActivityEvent[] = [];

      for (const grant of grants || []) {
        activityEvents.push({
          id: `grant-${grant.id}`,
          type: "grant_created",
          title: `New grant discovered: ${grant.title}`,
          entity_id: grant.id,
          entity_type: "grant",
          created_at: grant.created_at,
        });
      }

      for (const proposal of proposals || []) {
        const type =
          proposal.status === "accepted"
            ? "proposal_approved"
            : proposal.status === "rejected"
              ? "proposal_rejected"
              : proposal.status === "submitted"
                ? "proposal_submitted"
                : "deadline_approaching";
        activityEvents.push({
          id: `proposal-${proposal.id}`,
          type,
          title: `${proposal.title}`,
          entity_id: proposal.id,
          entity_type: "proposal",
          created_at: proposal.created_at,
        });
      }

      activityEvents.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return activityEvents.slice(0, 10);
    },
    refetchInterval: 30000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ActivitySkeleton />
        ) : !events?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {events.map((event) => (
              <Link
                key={event.id}
                to={event.entity_type === "grant" ? "/grants/$id" : "/proposals/$id"}
                params={{ id: event.entity_id }}
                className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  {ICON_MAP[event.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
