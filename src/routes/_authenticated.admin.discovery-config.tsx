import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDiscoveryConfig, updateDiscoveryConfig } from "@/lib/discovery-config.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/PageLayout";
import { Plus, X, Save, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/discovery-config")({
  head: () => ({ meta: [{ title: "Discovery Config — IIAL" }] }),
  component: DiscoveryConfigPage,
});

// Shape the form edits — camelCase, matching updateDiscoveryConfig's input.
type FormState = {
  maxPagesPerRun: number;
  scrapeConcurrency: number;
  fallbackMaxLinks: number;
  firecrawlSearchQuery: string;
  extraNonGrantUrlPatterns: string[];
  extraRootIndexPaths: string[];
  extraProgramHintKeywords: string[];
  extraNonProgramKeywords: string[];
  funderScoutQueries: string[];
  extraRssFeeds: Array<{ key: string; url: string; defaultAgency?: string }>;
  candidateAutoApproveThreshold: number;
  candidateReviewMinThreshold: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToForm(row: any): FormState {
  return {
    maxPagesPerRun: row?.max_pages_per_run ?? 15,
    scrapeConcurrency: row?.scrape_concurrency ?? 3,
    fallbackMaxLinks: row?.fallback_max_links ?? 12,
    firecrawlSearchQuery:
      row?.firecrawl_search_query ?? "program funding grant subvention financement",
    extraNonGrantUrlPatterns: row?.extra_non_grant_url_patterns ?? [],
    extraRootIndexPaths: row?.extra_root_index_paths ?? [],
    extraProgramHintKeywords: row?.extra_program_hint_keywords ?? [],
    extraNonProgramKeywords: row?.extra_non_program_keywords ?? [],
    funderScoutQueries: row?.funder_scout_queries ?? [],
    extraRssFeeds: row?.extra_rss_feeds ?? [],
    candidateAutoApproveThreshold: row?.candidate_auto_approve_threshold ?? 80,
    candidateReviewMinThreshold: row?.candidate_review_min_threshold ?? 40,
  };
}

function DiscoveryConfigPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDiscoveryConfig);
  const saveFn = useServerFn(updateDiscoveryConfig);

  const q = useQuery({
    queryKey: ["admin-discovery-config"],
    queryFn: () => getFn(),
  });

  const initial = useMemo(() => rowToForm(q.data), [q.data]);
  const [f, setF] = useState<FormState | null>(null);
  const form = f ?? initial;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF({ ...form, [k]: v });

  const dirty = f !== null && JSON.stringify(f) !== JSON.stringify(initial);

  const mut = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      toast.success("Discovery config saved");
      qc.invalidateQueries({ queryKey: ["admin-discovery-config"] });
      setF(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (q.isLoading) {
    return (
      <PageContainer size="form">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="default">
      <nav className="flex gap-4 text-sm text-muted-foreground -mb-2">
        <Link to="/admin/sources" className="hover:text-foreground">
          Discovery Sources
        </Link>
        <span className="font-semibold text-foreground">Discovery Config</span>
      </nav>
      <PageHeader
        eyebrow="Admin"
        title="Discovery configuration"
        description="Tune grant-search behavior without a code deploy — page/concurrency limits, noise filters, funder-scout seed queries, RSS feeds, and candidate approval thresholds. Every field falls back to its previous hardcoded default when left empty."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crawl limits</CardTitle>
          <CardDescription>Per-funder run bounds. Higher = more coverage, slower runs.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <Field label="Max pages per run" hint="Pages scraped per funder per discovery run.">
            <Input
              type="number"
              min={1}
              max={100}
              value={form.maxPagesPerRun}
              onChange={(e) => set("maxPagesPerRun", Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Scrape concurrency" hint="Pages fetched in parallel.">
            <Input
              type="number"
              min={1}
              max={20}
              value={form.scrapeConcurrency}
              onChange={(e) => set("scrapeConcurrency", Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Fallback max links" hint="Link cap on the no-Firecrawl fallback path.">
            <Input
              type="number"
              min={1}
              max={100}
              value={form.fallbackMaxLinks}
              onChange={(e) => set("fallbackMaxLinks", Number(e.target.value) || 1)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search seed query</CardTitle>
          <CardDescription>
            Used to rank a funder's own site map (Firecrawl search-focused pass).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={form.firecrawlSearchQuery}
            onChange={(e) => set("firecrawlSearchQuery", e.target.value)}
            placeholder="program funding grant subvention financement"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Noise filters (additive)</CardTitle>
          <CardDescription>
            Added on top of the built-in filters — never replaces them. Use when a live discovery
            run surfaces a new noise pattern (e.g. a platform-specific boilerplate URL) without
            waiting for a code deploy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="Non-grant URL patterns (regex)"
            hint='Tested against the page path, e.g. "\/s\/unsubscribe\b"'
          >
            <TagList
              value={form.extraNonGrantUrlPatterns}
              onChange={(v) => set("extraNonGrantUrlPatterns", v)}
              placeholder="\/policy\/covid-19"
              validate={isValidRegex}
            />
          </Field>
          <Field label="Root-index path slugs" hint="Rejects a page whose whole path is this slug.">
            <TagList
              value={form.extraRootIndexPaths}
              onChange={(v) => set("extraRootIndexPaths", v)}
              placeholder="/opportunities"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Extra program-hint keywords" hint="Boosts fallback link scoring.">
              <TagList
                value={form.extraProgramHintKeywords}
                onChange={(v) => set("extraProgramHintKeywords", v)}
                placeholder="rebate"
              />
            </Field>
            <Field label="Extra non-program keywords" hint="Suppresses fallback link scoring.">
              <TagList
                value={form.extraNonProgramKeywords}
                onChange={(v) => set("extraNonProgramKeywords", v)}
                placeholder="newsletter"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funder-scout seed queries</CardTitle>
          <CardDescription>
            Overrides the built-in 6 search seeds for the web-wide funder scout. Leave empty to
            keep the defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TagList
            value={form.funderScoutQueries}
            onChange={(v) => set("funderScoutQueries", v)}
            placeholder='"funding opportunities" Canada "clean tech" site:.ca'
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extra RSS feeds</CardTitle>
          <CardDescription>Added on top of the built-in Grants.gov/tri-council feeds.</CardDescription>
        </CardHeader>
        <CardContent>
          <RssFeedList
            value={form.extraRssFeeds}
            onChange={(v) => set("extraRssFeeds", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidate approval thresholds</CardTitle>
          <CardDescription>
            Funder-candidate score (0-100) that decides auto-approve vs. hold for review vs.
            discard as low-signal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <Field label="Auto-approve at or above">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.candidateAutoApproveThreshold}
              onChange={(e) => set("candidateAutoApproveThreshold", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Hold for review at or above">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.candidateReviewMinThreshold}
              onChange={(e) => set("candidateReviewMinThreshold", Number(e.target.value) || 0)}
            />
          </Field>
          {form.candidateReviewMinThreshold > form.candidateAutoApproveThreshold && (
            <p className="sm:col-span-2 text-xs text-destructive">
              Review threshold must be at or below the auto-approve threshold.
            </p>
          )}
        </CardContent>
      </Card>

      {dirty && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur-md shadow-lg">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-medium">Unsaved changes</span>
              <span className="text-muted-foreground"> — applies to the next discovery run.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setF(null)}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => mut.mutate()}
                disabled={
                  mut.isPending || form.candidateReviewMinThreshold > form.candidateAutoApproveThreshold
                }
              >
                <Save className="h-4 w-4 mr-1.5" />
                {mut.isPending ? "Saving…" : "Save config"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function isValidRegex(s: string): boolean {
  try {
    new RegExp(s);
    return true;
  } catch {
    return false;
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TagList({
  value,
  onChange,
  placeholder,
  validate,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  validate?: (s: string) => boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (validate && !validate(v)) {
      setError("Invalid pattern");
      return;
    }
    if (!value.includes(v)) onChange([...value, v]);
    setDraft("");
    setError(null);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground italic self-center">none</span>
        )}
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 pr-1 font-mono font-normal text-[11px]">
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="rounded hover:bg-muted-foreground/20 p-0.5"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-9 font-mono text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function RssFeedList({
  value,
  onChange,
}: {
  value: Array<{ key: string; url: string; defaultAgency?: string }>;
  onChange: (v: Array<{ key: string; url: string; defaultAgency?: string }>) => void;
}) {
  const [draft, setDraft] = useState({ key: "", url: "", defaultAgency: "" });
  const add = () => {
    if (!draft.key.trim() || !draft.url.trim()) return;
    try {
      new URL(draft.url);
    } catch {
      toast.error("Invalid feed URL");
      return;
    }
    onChange([
      ...value,
      {
        key: draft.key.trim(),
        url: draft.url.trim(),
        defaultAgency: draft.defaultAgency.trim() || undefined,
      },
    ]);
    setDraft({ key: "", url: "", defaultAgency: "" });
  };
  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-xs text-muted-foreground italic">none</p>}
      {value.map((feed) => (
        <div key={feed.key} className="flex items-center gap-2 rounded-md border p-2 text-xs">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{feed.key}</div>
            <div className="text-muted-foreground truncate">{feed.url}</div>
            {feed.defaultAgency && <div className="text-muted-foreground">{feed.defaultAgency}</div>}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(value.filter((f) => f.key !== feed.key))}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="grid sm:grid-cols-3 gap-2">
        <Input
          value={draft.key}
          onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          placeholder="feed_key"
        />
        <Input
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          placeholder="https://example.org/rss.xml"
        />
        <div className="flex gap-2">
          <Input
            value={draft.defaultAgency}
            onChange={(e) => setDraft({ ...draft, defaultAgency: e.target.value })}
            placeholder="Agency name (optional)"
          />
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
