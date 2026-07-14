import { Link, useRouterState } from "@tanstack/react-router";
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
  Menu,
  BookOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIsAdmin } from "@/lib/use-platform";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

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
  { to: "/submissions", labelKey: "nav.submissions", icon: Send },
  { to: "/org", labelKey: "org.title", icon: Building2 },
  { to: "/manual", labelKey: "nav.manual", icon: BookOpen },
  { to: "/fit-rules", labelKey: "nav.fitRules", icon: Sliders },
  { to: "/ops", labelKey: "ops.title", icon: Activity, adminOnly: true },
  { to: "/privacy", labelKey: "privacy.link", icon: ShieldCheck },
  { to: "/compliance", labelKey: "compliance.link", icon: Shield },
  { to: "/admin", labelKey: "Admin Console", icon: Settings },
];

export function MobileNav() {
  const { t } = useTranslation();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isAdmin = useIsAdmin();

  const isActive = (path: string) =>
    path === "/dashboard" ? currentPath === "/dashboard" : currentPath.startsWith(path);

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 shrink-0">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 items-center border-b px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-display text-sm font-bold">
              II
            </div>
            <span className="font-display text-lg tracking-tight">IIAL</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                  isActive(item.to)
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
