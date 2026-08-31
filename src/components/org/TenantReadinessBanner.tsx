import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getOrgProfile } from "@/lib/org.functions";
import { computeOrgProfileReadiness } from "@/lib/org-profile-readiness";

/** Persistent Action Needed cue; hidden as soon as verified matching is safe. */
export function TenantReadinessBanner() {
  const fetchProfile = useServerFn(getOrgProfile);
  const { data, isError } = useQuery({
    queryKey: ["org", "self"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });
  if (isError || !data) return null;

  const readiness = computeOrgProfileReadiness(data.profile);
  if (readiness.readyForVerifiedMatching) return null;

  const names = readiness.criticalMissing.slice(0, 3).map((item) => item.label.toLowerCase());
  return (
    <div className="border-b border-amber-300/70 bg-amber-50 px-4 py-2.5 text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/35 dark:text-amber-100 sm:px-6">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 text-sm">
        <p className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Action needed:</strong> IIAL matching is provisional until {names.join(", ")}
            {readiness.criticalMissing.length > 3 ? " and other core facts" : ""} are confirmed.
          </span>
        </p>
        <Link
          to="/org"
          className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-4"
        >
          Complete profile <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
