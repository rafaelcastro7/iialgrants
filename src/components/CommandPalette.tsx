import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  FileText,
  Send,
  Building2,
  Sliders,
  Activity,
  Shield,
  Settings,
  Plus,
  RefreshCw,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { listGrants } from "@/lib/grants.functions";
import { sanitizePgrstTerm } from "@/lib/search-sanitize";
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
  const [search, setSearch] = useState("");
  const fetchGrantRows = useServerFn(listGrants);
  // The input stays instant (bound to `search`), but the DB queries below
  // only fire against `debouncedSearch`, ~250ms after typing pauses. Without
  // this, every single keystroke fired a fresh "grants" + "proposals" query
  // (react-query dedupes by queryKey, which includes `search`, so it can't
  // collapse "IR" / "IRA" / "IRAP" into one request on its own).
  const [debouncedSearch, setDebouncedSearch] = useState("");

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

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const searchTerm = sanitizePgrstTerm(debouncedSearch);

  const { data: grants } = useQuery({
    queryKey: ["cmd-grants", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const lower = searchTerm.toLowerCase();
      const { grants: rows } = await fetchGrantRows({ data: { limit: 100 } });
      return rows
        .filter((grant) =>
          [grant.title, grant.funder, grant.status, grant.summary]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(lower)),
        )
        .slice(0, 5);
    },
    enabled: open && searchTerm.length >= 2,
  });

  const { data: proposals } = useQuery({
    queryKey: ["cmd-proposals", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const { data } = await supabase
        .from("proposals")
        .select("id, title, status")
        .ilike("title", `%${searchTerm}%`)
        .limit(5);
      return data || [];
    },
    enabled: open && searchTerm.length >= 2,
  });

  const navigationActions: CommandAction[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: Shield, to: "/dashboard" },
    { id: "grants", label: t("nav.grants"), icon: Search, to: "/grants" },
    { id: "proposals", label: t("nav.proposals"), icon: FileText, to: "/proposals" },
    { id: "submissions", label: t("nav.submissions"), icon: Send, to: "/submissions" },
    { id: "org", label: t("org.title"), icon: Building2, to: "/org" },
    { id: "manual", label: t("nav.manual"), icon: BookOpen, to: "/manual" },
    { id: "fit-rules", label: t("nav.fitRules"), icon: Sliders, to: "/fit-rules" },
    { id: "ops", label: t("ops.title"), icon: Activity, to: "/ops" },
    { id: "admin", label: "Admin Console", icon: Settings, to: "/admin" },
  ];

  const quickActions: CommandAction[] = [
    { id: "new-proposal", label: "New Proposal", icon: Plus, to: "/proposals" },
    { id: "run-discovery", label: "Run Grant Discovery", icon: RefreshCw, to: "/grants" },
  ];

  function handleSelect(action: CommandAction) {
    setOpen(false);
    if (action.to) {
      navigate({ to: action.to });
    } else if (action.onSelect) {
      action.onSelect();
    }
  }

  const showResults = search.length >= 2;
  const hasResults = (grants?.length || 0) + (proposals?.length || 0) > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search grants, proposals, or type a command..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {showResults ? "No results found." : "Type to search or navigate..."}
        </CommandEmpty>

        {showResults && hasResults && (
          <>
            {grants && grants.length > 0 && (
              <CommandGroup heading="Grants">
                {grants.map((grant) => (
                  <CommandItem
                    key={grant.id}
                    onSelect={() => {
                      setOpen(false);
                      navigate({ to: "/grants/$id", params: { id: grant.id } });
                    }}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span>{grant.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {grant.funder ? `${grant.funder} · ` : ""}
                        {grant.status} {grant.deadline ? `· Due ${grant.deadline}` : ""}
                      </span>
                    </div>
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {proposals && proposals.length > 0 && (
              <CommandGroup heading="Proposals">
                {proposals.map((proposal) => (
                  <CommandItem
                    key={proposal.id}
                    onSelect={() => {
                      setOpen(false);
                      navigate({ to: "/proposals/$id", params: { id: proposal.id } });
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span>{proposal.title}</span>
                      <span className="text-xs text-muted-foreground">{proposal.status}</span>
                    </div>
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Quick Actions">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <CommandItem key={action.id} onSelect={() => handleSelect(action)}>
                <Icon className="mr-2 h-4 w-4" />
                <span>{action.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

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
