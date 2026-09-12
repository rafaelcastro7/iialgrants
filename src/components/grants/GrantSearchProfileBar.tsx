import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Target, X } from "lucide-react";
import {
  createGrantSearchProfile,
  listGrantSearchProfiles,
} from "@/lib/grant-search-profiles.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  selectedProfileId: string | null;
  onSelect: (profileId: string | null) => void;
};

const splitTerms = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function GrantSearchProfileBar({ selectedProfileId, onSelect }: Props) {
  const qc = useQueryClient();
  const listProfiles = useServerFn(listGrantSearchProfiles);
  const createProfile = useServerFn(createGrantSearchProfile);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [activities, setActivities] = useState("");
  const [sectors, setSectors] = useState("");
  const [populations, setPopulations] = useState("");
  const [fundingUses, setFundingUses] = useState("");
  const [applicantTypes, setApplicantTypes] = useState("");
  const [peerOrganizations, setPeerOrganizations] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ["grant-search-profiles"],
    queryFn: () => listProfiles(),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createProfile({
        data: {
          name,
          mission,
          activities: splitTerms(activities),
          sectors: splitTerms(sectors),
          jurisdictions: ["CA"],
          populations_served: splitTerms(populations),
          funding_uses: splitTerms(fundingUses),
          applicant_types: splitTerms(applicantTypes),
          peer_organizations: splitTerms(peerOrganizations),
          amount_min_cad: null,
          amount_max_cad: null,
          project_start: null,
          project_end: null,
          role: "either",
          required_terms: [],
          excluded_terms: [],
          active: true,
        },
      }),
    onSuccess: async ({ profile }) => {
      await qc.invalidateQueries({ queryKey: ["grant-search-profiles"] });
      onSelect(profile.id);
      setCreating(false);
      setName("");
      setMission("");
      setActivities("");
      setSectors("");
      setPopulations("");
      setFundingUses("");
      setApplicantTypes("");
      setPeerOrganizations("");
      setError(null);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });
  const submitProfile = () => {
    if (!name.trim() || createMutation.isPending) return;
    setError(null);
    createMutation.mutate();
  };

  return (
    <section className="mx-auto mt-4 w-[min(96%,96rem)] rounded-xl border border-border/70 bg-card/95 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Target className="size-4 text-primary" aria-hidden="true" />
        <label className="text-sm font-medium" htmlFor="grant-search-profile">
          Search for a project
        </label>
        <select
          id="grant-search-profile"
          className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
          disabled={isPending}
          value={selectedProfileId ?? ""}
          onChange={(event) => onSelect(event.target.value || null)}
        >
          <option value="">General grant catalog</option>
          {(data?.profiles ?? []).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={() => setCreating((value) => !value)}>
          {creating ? <X className="mr-1 size-4" /> : <Plus className="mr-1 size-4" />}
          {creating ? "Cancel" : "New project profile"}
        </Button>
        {selectedProfileId && (
          <p className="text-xs text-muted-foreground">
            Results are ranked by project fit; hidden and rejected grants stay out of view.
          </p>
        )}
      </div>

      {creating && (
        <form
          className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitProfile();
          }}
        >
          <Input
            required
            maxLength={120}
            placeholder="Profile name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            required
            maxLength={4000}
            placeholder="Project mission or outcome"
            value={mission}
            onChange={(e) => setMission(e.target.value)}
          />
          <Input
            placeholder="Activities, comma separated"
            value={activities}
            onChange={(e) => setActivities(e.target.value)}
          />
          <Input
            placeholder="Sectors, comma separated"
            value={sectors}
            onChange={(e) => setSectors(e.target.value)}
          />
          <Input
            placeholder="Applicant types, comma separated"
            value={applicantTypes}
            onChange={(e) => setApplicantTypes(e.target.value)}
          />
          <Input
            placeholder="Populations served, comma separated"
            value={populations}
            onChange={(e) => setPopulations(e.target.value)}
          />
          <Input
            placeholder="Funding uses, comma separated"
            value={fundingUses}
            onChange={(e) => setFundingUses(e.target.value)}
          />
          <Input
            placeholder="Peer organizations, comma separated"
            value={peerOrganizations}
            onChange={(e) => setPeerOrganizations(e.target.value)}
          />
          <div className="flex items-center gap-3 md:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={createMutation.isPending || !name.trim()}
              onClick={submitProfile}
            >
              {createMutation.isPending ? "Creating…" : "Create and apply"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Peer organizations are used only as a bounded historical signal; eligibility rules
              remain authoritative.
            </p>
          </div>
          {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
        </form>
      )}
    </section>
  );
}
