import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useSuspenseQuery, useQueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAgentConfigs,
  updateAgentConfig,
  resetAgentPrompt,
  testAgentPrompt,
  listAgentRuns,
} from "@/lib/admin-agent-configs.functions";
import { toggleAgentFlag } from "@/lib/admin-agents.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Bot, Cpu, Gauge, RotateCcw, Save, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

const qo = queryOptions({ queryKey: ["admin", "agent-configs"], queryFn: () => listAgentConfigs() });

export const Route = createFileRoute("/_authenticated/admin/agents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  errorComponent: ({ error }) => <p className="text-sm text-destructive">Failed: {error.message}</p>,
  component: AgentsPage,
});

type AgentRow = Awaited<ReturnType<typeof listAgentConfigs>>["agents"][number];
type ModelInfo = Awaited<ReturnType<typeof listAgentConfigs>>["models"][number];

function AgentsPage() {
  const fetchAll = useServerFn(listAgentConfigs);
  const { data } = useSuspenseQuery({ queryKey: ["admin", "agent-configs"], queryFn: () => fetchAll() });
  const [active, setActive] = useState<string>(data.agents[0]?.agent ?? "discoverer");
  const current = data.agents.find((a) => a.agent === active)!;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="h-6 w-6" /> Agent Console</h1>
        <p className="text-sm text-muted-foreground">
          Full parametrization for each of the 6 LLM agents — model, prompt, generation params, reliability, and a live test playground. Inspired by Langfuse, LangSmith and OpenAI Agent Builder consoles.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {data.agents.map((a) => (
          <button
            key={a.agent}
            onClick={() => setActive(a.agent)}
            className={`text-left p-3 rounded-lg border transition ${active === a.agent ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm capitalize">{a.agent}</span>
              <span className={`h-2 w-2 rounded-full ${a.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {a.stats.runs_24h} runs · {Math.round(a.stats.success_rate * 100)}% ok
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{a.model}</div>
          </button>
        ))}
      </div>

      <AgentEditor key={current.agent} agent={current} models={data.models} />
    </div>
  );
}

function AgentEditor({ agent, models }: { agent: AgentRow; models: readonly ModelInfo[] }) {
  const qc = useQueryClient();
  const update = useServerFn(updateAgentConfig);
  const resetPrompt = useServerFn(resetAgentPrompt);
  const toggle = useServerFn(toggleAgentFlag);

  const [draft, setDraft] = useState({
    model: agent.model,
    fallback_model: agent.fallback_model ?? "",
    temperature: agent.temperature,
    top_p: agent.top_p,
    max_output_tokens: agent.max_output_tokens,
    json_mode: agent.json_mode,
    system_prompt: agent.system_prompt ?? agent.builtin_prompt,
    prompt_version: agent.prompt_version,
    timeout_ms: agent.timeout_ms,
    max_retries: agent.max_retries,
    concurrency: agent.concurrency,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify({
      model: agent.model,
      fallback_model: agent.fallback_model ?? "",
      temperature: agent.temperature,
      top_p: agent.top_p,
      max_output_tokens: agent.max_output_tokens,
      json_mode: agent.json_mode,
      system_prompt: agent.system_prompt ?? agent.builtin_prompt,
      prompt_version: agent.prompt_version,
      timeout_ms: agent.timeout_ms,
      max_retries: agent.max_retries,
      concurrency: agent.concurrency,
    }),
    [draft, agent],
  );

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const promptOverride = draft.system_prompt.trim() === agent.builtin_prompt.trim() ? null : draft.system_prompt;
      await update({ data: {
        agent: agent.agent as never,
        model: draft.model,
        fallback_model: draft.fallback_model || null,
        temperature: draft.temperature,
        top_p: draft.top_p,
        max_output_tokens: draft.max_output_tokens,
        json_mode: draft.json_mode,
        system_prompt: promptOverride,
        prompt_version: draft.prompt_version,
        timeout_ms: draft.timeout_ms,
        max_retries: draft.max_retries,
        concurrency: draft.concurrency,
      } });
      setMsg({ type: "ok", text: "Saved. Live within 30s (cache TTL)." });
      await qc.invalidateQueries({ queryKey: ["admin", "agent-configs"] });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  }

  async function doReset() {
    if (!confirm("Reset prompt to built-in default?")) return;
    await resetPrompt({ data: { agent: agent.agent as never } });
    await qc.invalidateQueries({ queryKey: ["admin", "agent-configs"] });
  }

  async function onToggleEnabled(v: boolean) {
    await toggle({ data: { agent: agent.agent, enabled: v } });
    await qc.invalidateQueries({ queryKey: ["admin", "agent-configs"] });
    await qc.invalidateQueries({ queryKey: ["admin", "agents"] });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="capitalize flex items-center gap-2">
              {agent.agent}
              <Badge variant="outline" className="font-mono">v{agent.prompt_version}</Badge>
              {agent.system_prompt && <Badge variant="secondary">custom prompt</Badge>}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatBlock label="Runs 24h" value={agent.stats.runs_24h} icon={<Activity className="h-3.5 w-3.5" />} />
            <StatBlock label="Success" value={`${Math.round(agent.stats.success_rate * 100)}%`} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
            <StatBlock label="Avg ms" value={agent.stats.avg_latency_ms} icon={<Gauge className="h-3.5 w-3.5" />} />
            <StatBlock label="Tokens 24h" value={agent.stats.total_tokens_24h.toLocaleString()} icon={<Cpu className="h-3.5 w-3.5" />} />
            <div className="flex items-center gap-2 pl-3 border-l">
              <Label className="text-xs">Enabled</Label>
              <Switch checked={agent.enabled} onCheckedChange={onToggleEnabled} />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Tabs defaultValue="model">
          <TabsList>
            <TabsTrigger value="model">Model & Generation</TabsTrigger>
            <TabsTrigger value="prompt">System Prompt</TabsTrigger>
            <TabsTrigger value="reliability">Reliability</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="runs">Recent Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="model" className="space-y-5 pt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Primary model">
                <Select value={draft.model} onValueChange={(v) => setDraft({ ...draft, model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex items-center gap-2">
                          <span>{m.label}</span>
                          <Badge variant={m.tier === "free" ? "secondary" : "default"} className="text-[10px]">{m.tier}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fallback model (on rate-limit / failure)">
                <Select value={draft.fallback_model || "none"} onValueChange={(v) => setDraft({ ...draft, fallback_model: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <SliderField label="Temperature" hint="Higher = more creative, less deterministic."
                value={draft.temperature} min={0} max={2} step={0.05}
                onChange={(v) => setDraft({ ...draft, temperature: v })} />
              <SliderField label="Top-P" hint="Nucleus sampling cutoff."
                value={draft.top_p} min={0} max={1} step={0.05}
                onChange={(v) => setDraft({ ...draft, top_p: v })} />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Max output tokens">
                <Input type="number" min={64} max={32000}
                  value={draft.max_output_tokens}
                  onChange={(e) => setDraft({ ...draft, max_output_tokens: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="JSON mode">
                <div className="flex items-center h-9 gap-2">
                  <Switch checked={draft.json_mode} onCheckedChange={(v) => setDraft({ ...draft, json_mode: v })} />
                  <span className="text-xs text-muted-foreground">Force JSON-object response</span>
                </div>
              </Field>
              <Field label="Prompt version">
                <Input value={draft.prompt_version} onChange={(e) => setDraft({ ...draft, prompt_version: e.target.value })} />
              </Field>
            </div>
          </TabsContent>

          <TabsContent value="prompt" className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                System prompt sent to the model. Empty / matches default = use built-in.
              </p>
              <Button variant="outline" size="sm" onClick={doReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-2" /> Reset to built-in
              </Button>
            </div>
            <Textarea rows={16} className="font-mono text-xs leading-relaxed"
              value={draft.system_prompt}
              onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">
              {draft.system_prompt.length.toLocaleString()} chars · ≈{Math.ceil(draft.system_prompt.length / 4).toLocaleString()} tokens
            </p>
          </TabsContent>

          <TabsContent value="reliability" className="grid md:grid-cols-3 gap-4 pt-4">
            <Field label="Timeout (ms)" hint="Abort the call after this many ms.">
              <Input type="number" min={5000} max={300000}
                value={draft.timeout_ms}
                onChange={(e) => setDraft({ ...draft, timeout_ms: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Max retries" hint="Retries on 429 / 5xx before fallback model.">
              <Input type="number" min={0} max={10}
                value={draft.max_retries}
                onChange={(e) => setDraft({ ...draft, max_retries: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Concurrency" hint="Max parallel calls for this agent.">
              <Input type="number" min={1} max={32}
                value={draft.concurrency}
                onChange={(e) => setDraft({ ...draft, concurrency: Number(e.target.value) || 0 })} />
            </Field>
          </TabsContent>

          <TabsContent value="playground" className="pt-4">
            <Playground agent={agent.agent} />
          </TabsContent>

          <TabsContent value="runs" className="pt-4">
            <RecentRuns agent={agent.agent} />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-6 mt-4 border-t">
          <div className="text-xs text-muted-foreground">
            Updated {new Date(agent.updated_at).toLocaleString()}
            {msg && (
              <span className={`ml-3 inline-flex items-center gap-1 ${msg.type === "ok" ? "text-emerald-600" : "text-destructive"}`}>
                {msg.type === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {msg.text}
              </span>
            )}
          </div>
          <Button onClick={save} disabled={!dirty || saving}>
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SliderField({ label, hint, value, min, max, step, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="text-xs font-mono">{value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatBlock({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 justify-end">{icon} {label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function Playground({ agent }: { agent: string }) {
  const test = useServerFn(testAgentPrompt);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text?: string; error?: string; latency_ms: number; input_tokens?: number | null; output_tokens?: number | null; model: string } | null>(null);

  async function run() {
    if (!input.trim()) return;
    setRunning(true); setResult(null);
    try {
      const r = await test({ data: { agent: agent as never, user_message: input } });
      setResult(r);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e), latency_ms: 0, model: "" });
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-3">
      <Field label="User message" hint="Sent with the current saved config (system prompt + model + params).">
        <Textarea rows={5} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a sample grant snippet, org profile, or any test input…" />
      </Field>
      <Button onClick={run} disabled={running || !input.trim()}>
        <Sparkles className="h-4 w-4 mr-2" /> {running ? "Running…" : "Run test"}
      </Button>
      {result && (
        <div className={`rounded-lg border p-3 ${result.ok ? "" : "border-destructive/40 bg-destructive/5"}`}>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <Badge variant={result.ok ? "default" : "destructive"}>{result.ok ? "ok" : "error"}</Badge>
            <span className="font-mono">{result.model}</span>
            <span>{result.latency_ms} ms</span>
            {result.input_tokens != null && <span>in: {result.input_tokens}</span>}
            {result.output_tokens != null && <span>out: {result.output_tokens}</span>}
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono max-h-96 overflow-auto">{result.ok ? result.text : result.error}</pre>
        </div>
      )}
    </div>
  );
}

function RecentRuns({ agent }: { agent: string }) {
  const fetchRuns = useServerFn(listAgentRuns);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "agent-runs", agent],
    queryFn: () => fetchRuns({ data: { agent: agent as never, limit: 20 } }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading runs…</p>;
  const runs = data?.runs ?? [];
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No runs yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Latency</TableHead>
          <TableHead className="text-right">In / Out tokens</TableHead>
          <TableHead>Grant</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => (
          <TableRow key={r.run_id}>
            <TableCell className="text-xs">{new Date(r.created_at as string).toLocaleString()}</TableCell>
            <TableCell><Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
            <TableCell className="font-mono text-xs">{r.model}</TableCell>
            <TableCell className="text-right font-mono text-xs">{r.latency_ms ?? "-"} ms</TableCell>
            <TableCell className="text-right font-mono text-xs">{r.input_tokens ?? 0} / {r.output_tokens ?? 0}</TableCell>
            <TableCell className="font-mono text-xs">{r.grant_id ? String(r.grant_id).slice(0, 8) : "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
