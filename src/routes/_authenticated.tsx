import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { V2AuthenticatedShell } from "@/components/v2/V2AuthenticatedShell";
import { UiVersionProvider } from "@/components/v2/UiVersionProvider";
import { useUiVersion } from "@/components/v2/ui-version";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: location.pathname } });
    }
  },
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <UiVersionProvider>
      <AuthenticatedLayoutInner />
    </UiVersionProvider>
  );
}

function AuthenticatedLayoutInner() {
  const { version } = useUiVersion();

  if (version === "v2") {
    return (
      <V2AuthenticatedShell>
        <CommandPalette />
        <Outlet />
      </V2AuthenticatedShell>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <CommandPalette />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
