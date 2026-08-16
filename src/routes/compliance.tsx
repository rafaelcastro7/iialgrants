import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired 2026-07-23: this used to be a standalone, PUBLIC, unauthenticated
// page with static legal copy — its own "your rights" card just linked to
// /privacy anyway, so it was pure duplication with an extra broken hop (it
// dropped signed-in users out of the app entirely). The informational
// content that wasn't already covered by /privacy moved into a new
// "Compliance & frameworks" card there (see
// _authenticated.privacy.tsx's ComplianceAndTrustCard). This redirect keeps
// old bookmarks/links working.
export const Route = createFileRoute("/compliance")({
  beforeLoad: () => {
    throw redirect({ to: "/privacy" });
  },
});
