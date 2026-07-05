import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Search,
  FileText,
  Send,
  Building2,
  Sliders,
  Activity,
  Shield,
  Settings,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import "@/i18n";

type CommandAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  onSelect?: () => void;
};

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigationActions: CommandAction[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: Shield, to: "/dashboard" },
    { id: "grants", label: t("nav.grants"), icon: Search, to: "/grants" },
    { id: "proposals", label: t("nav.proposals"), icon: FileText, to: "/proposals" },
    { id: "submissions", label: t("nav.submissions"), icon: Send, to: "/submissions" },
    { id: "org", label: t("org.title"), icon: Building2, to: "/org" },
    { id: "fit-rules", label: t("nav.fitRules"), icon: Sliders, to: "/fit-rules" },
    { id: "ops", label: t("ops.title"), icon: Activity, to: "/ops" },
    { id: "admin", label: "Admin Console", icon: Settings, to: "/admin" },
  ];

  function handleSelect(action: CommandAction) {
    setOpen(false);
    if (action.to) {
      navigate({ to: action.to });
    } else if (action.onSelect) {
      action.onSelect();
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navigationActions.map((action) => {
            const Icon = action.icon;
            return (
              <CommandItem key={action.id} onSelect={() => handleSelect(action)}>
                <Icon className="mr-2 h-4 w-4" />
                <span>{action.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
