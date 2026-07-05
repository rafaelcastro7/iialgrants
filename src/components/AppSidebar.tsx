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
import "@/i18n";

type NavItem = {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/grants", labelKey: "nav.grants", icon: Search },
  { to: "/proposals", labelKey: "nav.proposals", icon: FileText },
  { to: "/quality", labelKey: "nav.quality", icon: BarChart3 },
  { to: "/submissions", labelKey: "nav.submissions", icon: Send },
  { to: "/post-award", labelKey: "nav.postAward", icon: Trophy },
  { to: "/competitive", labelKey: "nav.competitive", icon: BarChart3 },
  { to: "/org", labelKey: "org.title", icon: Building2 },
  { to: "/fit-rules", labelKey: "nav.fitRules", icon: Sliders },
  { to: "/ops", labelKey: "ops.title", icon: Activity, adminOnly: true },
  { to: "/privacy", labelKey: "privacy.link", icon: ShieldCheck },
  { to: "/compliance", labelKey: "compliance.link", icon: Shield },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { state, toggleSidebar } = useSidebar();

  const isActive = (path: string) =>
    path === "/dashboard" ? currentPath === "/dashboard" : currentPath.startsWith(path);

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

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
              {visibleItems.map((item) => {
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Admin Console">
                  <Link to="/admin" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <span>Admin Console</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/75 px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        {title && (
          <h1 className="font-display text-xl leading-none text-foreground md:text-2xl">{title}</h1>
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
