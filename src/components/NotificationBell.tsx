// Surfaces deadline/decision reminders (populated by the daily cron webhook)
// that previously had zero UI — closing the market's "multi-touch reminders"
// gap (Instrumentl) with what the backend was already computing.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins}m ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fetchFn = useServerFn(listNotifications);
  const markOneFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;
  const uniqueNotifications = notifications.filter(
    (n, index, list) => list.findIndex((item) => item.id === n.id) === index,
  );

  async function onOpenChange(next: boolean) {
    setOpen(next);
  }

  async function onItemClick(id: string, readAt: string | null) {
    if (!readAt) {
      await markOneFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  async function onMarkAll() {
    await markAllFn();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="relative"
        onClick={() => onOpenChange(!open)}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px] leading-4"
          >
            {unread > 9 ? "9+" : unread}
          </Badge>
        )}
      </Button>

      {open && (
        <>
          {/* click-outside overlay */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[calc(100vw-1rem)] max-w-80 rounded-md border bg-card shadow-lg sm:w-80">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={onMarkAll}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y">
              {uniqueNotifications.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No notifications yet.
                </li>
              )}
              {uniqueNotifications.map((n, index) => (
                <li key={`${n.id}-${index}`}>
                  <Link
                    to={n.grant_id ? "/grants/$id" : "/dashboard"}
                    params={n.grant_id ? { id: n.grant_id } : undefined}
                    onClick={() => onItemClick(n.id, n.read_at)}
                    className={`block px-3 py-2.5 text-xs hover:bg-muted/50 ${
                      !n.read_at ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{n.title_en}</span>
                      {!n.read_at && (
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{n.body_en}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {timeAgo(n.created_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
