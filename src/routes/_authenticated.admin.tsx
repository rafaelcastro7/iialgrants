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
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
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
      <div className="flex min-h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border/60 bg-background/75 px-3 py-3 backdrop-blur-xl md:px-4">
            <SidebarTrigger />
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              II
            </div>
            <span aria-hidden className="text-muted-foreground/40">
              /
            </span>
            <span className="text-sm font-medium text-foreground/80">Admin console</span>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
