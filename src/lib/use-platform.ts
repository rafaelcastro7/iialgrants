import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useModuleFlags() {
  return useQuery({
    queryKey: ["module-flags"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("module_flags").select("module, enabled");
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
  return (
    useQuery({
      queryKey: ["is-admin"],
      staleTime: 60_000,
      queryFn: async () => {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return false;
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", u.user.id)
          .eq("role", "admin")
          .maybeSingle();
        return !!data;
      },
    }).data ?? false
  );
}
