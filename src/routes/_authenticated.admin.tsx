import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Button } from "@/components/ui/button";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

// Admin layout. The parent `_authenticated` already gates by session.
// Admin role is checked client-side here AND server-side in every admin server fn
// (defense in depth). SSR-friendly: no blocking await in beforeLoad.
export const Route = createFileRoute("/_authenticated/admin")({
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} onRetry={reset} />,
  component: AdminLayout,
});

function AdminLayout() {
  const [state, setState] = useState<"checking" | "admin" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) setState("denied");
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setState(data ? "admin" : "denied");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Checking permissions…
      </main>
    );
  }
  if (state === "denied") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">Admin only</h1>
        <p className="text-sm text-muted-foreground">
          You do not have access to the admin console.
        </p>
        <Link to="/dashboard">
          <Button>Back to dashboard</Button>
        </Link>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 border-b flex items-center px-2 gap-2">
            <SidebarTrigger />
            <span className="text-sm font-semibold">IIAL Admin</span>
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
