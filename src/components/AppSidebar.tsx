import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Search,
  FileText,
  Send,
  Building2,
  Sliders,
  Activity,
  ShieldCheck,
  Shield,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  User,
  BarChart3,
  Trophy,
  DollarSign,
  Target,
  RefreshCw,
  Calendar,
  ListTodo,
  GitBranch,
  History,
  BrainCircuit,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/use-platform";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UiVersionToggle } from "@/components/v2/UiVersionToggle";
import "@/i18n";

type NavItem = {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// Groups mirror the `eyebrow` category each destination page already
// declares on itself (PageHeader eyebrow="Pipeline"/"Post-award"/"Operations"/
// "Market intelligence"/"Admin"/etc.) — the sidebar used to be one flat list
// of 19 items with no relationship to that taxonomy, so arriving on a page
// gave no sense of where it sat relative to anything else. Grouping by the
// same categories the pages already use makes "what section am I in" and
// "how do I get to related things" the same mental model.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Discover",
    items: [
      { to: "/grants", labelKey: "nav.grants", icon: Search },
      { to: "/funders", labelKey: "nav.funders", icon: Building2 },
      { to: "/fit-rules", labelKey: "nav.fitRules", icon: Sliders },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { to: "/proposals", labelKey: "nav.proposals", icon: FileText },
      { to: "/quality", labelKey: "nav.quality", icon: BarChart3 },
      { to: "/submissions", labelKey: "nav.submissions", icon: Send },
    ],
  },
  {
    label: "Post-award",
    items: [
      { to: "/post-award", labelKey: "nav.postAward", icon: Trophy },
      { to: "/financial", labelKey: "nav.financial", icon: DollarSign },
      { to: "/impact", labelKey: "nav.impact", icon: Target },
      { to: "/renewal", labelKey: "nav.renewal", icon: RefreshCw },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/tasks", labelKey: "nav.tasks", icon: ListTodo },
      { to: "/compliance-calendar", labelKey: "nav.complianceCalendar", icon: Calendar },
    ],
  },
  {
    label: "Market intelligence",
    items: [{ to: "/competitive", labelKey: "nav.competitive", icon: BarChart3 }],
  },
  {
    label: "Workspace",
    items: [
      { to: "/org", labelKey: "org.title", icon: Building2 },
      { to: "/compliance", labelKey: "compliance.link", icon: Shield },
      { to: "/privacy", labelKey: "privacy.link", icon: ShieldCheck },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/autonomy", labelKey: "nav.autonomy", icon: BrainCircuit, adminOnly: true },
      { to: "/ops", labelKey: "ops.title", icon: Activity, adminOnly: true },
      { to: "/admin/audit-trail", labelKey: "nav.auditTrail", icon: History, adminOnly: true },
      { to: "/admin/workflows", labelKey: "nav.workflows", icon: GitBranch, adminOnly: true },
    ],
  },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { state, toggleSidebar } = useSidebar();

  const isActive = (path: string) =>
    path === "/dashboard" ? currentPath === "/dashboard" : currentPath.startsWith(path);

  // Drop a group entirely once every item in it is admin-only and the
  // viewer isn't an admin, instead of leaving a labeled section with zero
  // items under it.
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/50">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-display text-sm font-bold">
            II
          </div>
          {state === "expanded" && (
            <span className="font-display text-lg leading-none tracking-tight">IIAL</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/dashboard")}
                  tooltip={t("nav.dashboard")}
                >
                  <Link to="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>{t("nav.dashboard")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            {/* Mirrors each destination page's own eyebrow tick+label so the
                sidebar section a link lives in visually rhymes with the
                heading the page shows once you're there. */}
            <SidebarGroupLabel className="gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-brand" />
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.to)}
                        tooltip={t(item.labelKey)}
                      >
                        <Link to={item.to} className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                {group.label === "Admin" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Admin Console">
                      <Link to="/admin" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        <span>Admin Console</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-2">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">II</AvatarFallback>
                </Avatar>
                <span className="truncate">IIAL User</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => navigate({ to: "/org" })}>
                <User className="mr-2 h-4 w-4" />
                Organization Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                {t("nav.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={toggleSidebar}>
            {state === "expanded" ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppTopBar({ title }: { title?: string }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();

  return (
    <header className="v1-app-topbar sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/75 px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        {title && (
          <span className="truncate text-sm font-medium text-muted-foreground">{title}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
        >
          <Search className="h-4 w-4" />
          <span className="hidden md:inline">Search...</span>
          <kbd className="pointer-events-none hidden select-none rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground md:inline">
            ⌘K
          </kbd>
        </Button>
        <NotificationBell />
        <UiVersionToggle compact />
        {isAdmin && (
          <Link to="/admin">
            <Button variant="outline" size="sm" className="gap-1">
              <Shield className="h-4 w-4" /> Console
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
