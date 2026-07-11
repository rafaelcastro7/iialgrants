import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Command,
  DollarSign,
  FileText,
  Home,
  Landmark,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Radar,
  RefreshCw,
  Scale,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/use-platform";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UiVersionToggle } from "@/components/v2/UiVersionToggle";

type NavItem = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  accent: "teal" | "amber" | "violet" | "green" | "rose";
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Command",
    accent: "teal",
    items: [
      {
        to: "/dashboard",
        label: "Command center",
        description: "Today, priorities, intelligence",
        icon: Home,
      },
    ],
  },
  {
    label: "Prospect intelligence",
    accent: "amber",
    items: [
      { to: "/grants", label: "Grant radar", description: "Discover and qualify", icon: Radar },
      {
        to: "/funders",
        label: "Funder atlas",
        description: "CRA, history, patterns",
        icon: Landmark,
      },
      {
        to: "/fit-rules",
        label: "Fit rules",
        description: "IIAL eligibility model",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    label: "Pursuit pipeline",
    accent: "violet",
    items: [
      {
        to: "/proposals",
        label: "Proposal studio",
        description: "Drafts and sections",
        icon: FileText,
      },
      { to: "/quality", label: "Quality board", description: "Scores and gaps", icon: BarChart3 },
      { to: "/submissions", label: "Submissions", description: "Sent, won, waiting", icon: Send },
    ],
  },
  {
    label: "Award operations",
    accent: "green",
    items: [
      { to: "/post-award", label: "Award desk", description: "Outcomes and reports", icon: Trophy },
      { to: "/financial", label: "Financials", description: "Budget vs actuals", icon: DollarSign },
      { to: "/impact", label: "Impact", description: "Measures and evidence", icon: Target },
      { to: "/renewal", label: "Renewal", description: "Next-cycle likelihood", icon: RefreshCw },
    ],
  },
  {
    label: "Control room",
    accent: "rose",
    items: [
      { to: "/tasks", label: "Tasks", description: "Assignments and follow-up", icon: ListChecks },
      {
        to: "/compliance-calendar",
        label: "Compliance",
        description: "Deadlines and reminders",
        icon: CalendarDays,
      },
      {
        to: "/competitive",
        label: "Market intel",
        description: "Recipients and programs",
        icon: LayoutGrid,
      },
      {
        to: "/ops",
        label: "Operations",
        description: "Platform health",
        icon: Activity,
        adminOnly: true,
      },
      {
        to: "/admin",
        label: "Admin console",
        description: "Users, agents, modules",
        icon: Settings,
        adminOnly: true,
      },
    ],
  },
  {
    label: "Workspace",
    accent: "teal",
    items: [
      { to: "/org", label: "Organization", description: "Profile and criteria", icon: Building2 },
      { to: "/compliance", label: "Governance", description: "Policy and assurance", icon: Shield },
      { to: "/privacy", label: "Privacy", description: "Local-first posture", icon: Scale },
    ],
  },
];

const LIFECYCLE = [
  { label: "Discover", icon: Search },
  { label: "Fit", icon: CheckCircle2 },
  { label: "Draft", icon: FileText },
  { label: "Submit", icon: Send },
  { label: "Award", icon: Trophy },
  { label: "Report", icon: CalendarDays },
];

const ACCENT_CLASS: Record<NavGroup["accent"], string> = {
  teal: "bg-teal-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  green: "bg-emerald-400",
  rose: "bg-rose-400",
};

export function V2AuthenticatedShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0);
  const activeItem = findActiveItem(currentPath, visibleGroups);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div data-ui-version="v2" className="min-h-screen bg-background text-foreground">
        <div className="fixed inset-y-0 left-0 z-40 hidden w-[292px] border-r border-white/10 bg-[oklch(0.2_0.026_218)] text-white lg:flex lg:flex-col">
          <V2DesktopNav activePath={currentPath} groups={visibleGroups} onSignOut={signOut} />
        </div>

        <div className="min-h-screen lg:pl-[292px]">
          <V2TopBar
            activeItem={activeItem}
            activePath={currentPath}
            groups={visibleGroups}
            onSignOut={signOut}
          />
          <main className="min-h-[calc(100vh-65px)] pb-10">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function V2DesktopNav({
  activePath,
  groups,
  onSignOut,
}: {
  activePath: string;
  groups: NavGroup[];
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="border-b border-white/10 px-5 py-4">
        <Link to="/dashboard" className="group flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-sm font-black text-[oklch(0.2_0.026_218)] shadow-sm">
            II
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-normal">IIAL Grants</div>
            <div className="text-xs text-white/56">Opportunity operating system</div>
          </div>
        </Link>

        <button
          type="button"
          onClick={openCommandPalette}
          className="mt-4 flex w-full items-center justify-between rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-left text-sm text-white/86 transition-colors hover:bg-white/[0.1]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Command className="h-4 w-4 shrink-0 text-teal-200" />
            <span className="truncate">Search grants, funders, proposals</span>
          </span>
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/56">
            Cmd K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-normal text-white/46">
                <span className={cn("h-1.5 w-1.5 rounded-full", ACCENT_CLASS[group.accent])} />
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <V2NavLink key={item.to} item={item} active={isPathActive(activePath, item.to)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="rounded-md border border-white/10 bg-white/[0.055] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Bot className="h-4 w-4 text-teal-200" />
            Local AI stack
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-white/62">
            <span className="rounded-[6px] bg-white/[0.07] px-2 py-1">Ollama</span>
            <span className="rounded-[6px] bg-white/[0.07] px-2 py-1">Supabase</span>
            <span className="rounded-[6px] bg-white/[0.07] px-2 py-1">RLS</span>
            <span className="rounded-[6px] bg-white/[0.07] px-2 py-1">0 cloud tokens</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <UiVersionToggle className="border-white/10 bg-white/[0.06] text-white" compact />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={onSignOut}
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Sign out</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </>
  );
}

function V2TopBar({
  activeItem,
  activePath,
  groups,
  onSignOut,
}: {
  activeItem?: NavItem;
  activePath: string;
  groups: NavGroup[];
  onSignOut: () => void;
}) {
  const Icon = activeItem?.icon ?? Sparkles;

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/92 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <V2MobileNav activePath={activePath} groups={groups} onSignOut={onSignOut} />
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-card text-primary shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
              V2 workspace
              <ChevronRight className="h-3 w-3" />
              Local-first
            </div>
            <div className="truncate text-sm font-semibold tracking-normal">
              {activeItem?.label ?? "IIAL command surface"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden min-w-[220px] justify-start gap-2 text-muted-foreground md:flex"
            onClick={openCommandPalette}
          >
            <Search className="h-4 w-4" />
            Search workspace
            <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Cmd K
            </kbd>
          </Button>

          <Badge variant="outline" className="hidden gap-1.5 rounded-md px-2.5 py-1 md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Local only
          </Badge>

          <UiVersionToggle className="hidden sm:inline-flex" compact />
          <ThemeToggle />
          <NotificationBell />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={openCommandPalette}
              >
                <Command className="h-4 w-4" />
                <span className="sr-only">Open command palette</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Command palette</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="hidden border-t border-border/55 px-5 py-2 xl:block">
        <div className="flex items-center gap-2 overflow-hidden text-[11px] text-muted-foreground">
          {LIFECYCLE.map((stage, index) => {
            const StageIcon = stage.icon;
            return (
              <div key={stage.label} className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-medium text-foreground">
                  <StageIcon className="h-3.5 w-3.5 text-primary" />
                  {stage.label}
                </span>
                {index < LIFECYCLE.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}

function V2MobileNav({
  activePath,
  groups,
  onSignOut,
}: {
  activePath: string;
  groups: NavGroup[];
  onSignOut: () => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 lg:hidden">
          <Menu className="h-4 w-4" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[320px] max-w-[86vw] border-white/10 bg-[oklch(0.2_0.026_218)] p-0 text-white"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <V2DesktopNav activePath={activePath} groups={groups} onSignOut={onSignOut} />
      </SheetContent>
    </Sheet>
  );
}

function V2NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "group flex min-h-12 items-center gap-3 rounded-md px-2.5 py-2 transition-colors",
        active
          ? "bg-white text-[oklch(0.2_0.026_218)] shadow-sm"
          : "text-white/72 hover:bg-white/[0.08] hover:text-white",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
          active ? "border-black/5 bg-[oklch(0.94_0.02_190)]" : "border-white/10 bg-white/[0.06]",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-normal">{item.label}</span>
        <span className={cn("block truncate text-xs", active ? "text-black/55" : "text-white/42")}>
          {item.description}
        </span>
      </span>
    </Link>
  );
}

function findActiveItem(path: string, groups: NavGroup[]) {
  return groups
    .flatMap((group) => group.items)
    .filter((item) => isPathActive(path, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

function isPathActive(currentPath: string, itemPath: string) {
  return itemPath === "/dashboard"
    ? currentPath === "/dashboard"
    : currentPath.startsWith(itemPath);
}

function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}
