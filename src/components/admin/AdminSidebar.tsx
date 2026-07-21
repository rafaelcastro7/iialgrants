import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  LayoutDashboard,
  Bot,
  History,
  Sparkles,
  ToggleLeft,
  Users,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Modules", url: "/admin/modules", icon: ToggleLeft },
  { title: "AI Agents", url: "/admin/agents", icon: Bot },
  { title: "Discovery Sources", url: "/admin/sources", icon: Globe },
  { title: "Funder Candidates", url: "/admin/candidates", icon: Sparkles },
  { title: "Discovery History", url: "/admin/history", icon: History },
];

export function AdminSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (path: string) =>
    path === "/admin" ? currentPath === "/admin" : currentPath.startsWith(path);

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-card/45 p-3 md:flex md:flex-col">
      <div className="px-2 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Admin Console
      </div>

      <nav aria-label="Admin Console" className="mt-2 flex-1 space-y-1">
        {items.map((item) => {
          const active = isActive(item.url);
          const Icon = item.icon;

          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <Link
        to="/dashboard"
        className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to app</span>
      </Link>
    </aside>
  );
}
