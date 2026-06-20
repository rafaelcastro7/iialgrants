import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useModuleFlags() {
  return useQuery({
    queryKey: ["module-flags"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("module_flags")
        .select("module, enabled");
      if (error) throw new Error(error.message);
      const map = new Map<string, boolean>((data ?? []).map((r) => [r.module, r.enabled]));
      return {
        list: data ?? [],
        isEnabled: (m: string) => map.get(m) ?? true,
      };
    },
  });
}

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { if (!cancelled) setIsAdmin(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, []);
  return isAdmin;
}
