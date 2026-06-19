import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Auth gate (Phase 0 scaffold). Protected routes live under this layout.
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // SSR-safe: on the server there is no session, redirect to /auth.
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: location.pathname } });
    }
  },
  component: () => <Outlet />,
});
