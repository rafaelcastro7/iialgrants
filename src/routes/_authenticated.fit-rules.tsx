import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFitRules, saveFitRules, previewFitRules } from "@/lib/fit-rules.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, X, Plus } from "lucide-react";
import type { FitRules } from "@/agents/fit-rules.server";

const rulesQO = queryOptions({ queryKey: ["fit-rules"], queryFn: () => getFitRules() });

export const Route = createFileRoute("/_authenticated/fit-rules")({
  head: () => ({ meta: [{ title: "Fit Rules — IIAL" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQO),
  component: FitRulesPage,
});

type ChipsProps = { value: string[]; onChange: (v: string[]) => void; placeholder: string; uppercase?: boolean };
function Chips({ value, onChange, placeholder, uppercase }: ChipsProps) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = uppercase ? draft.trim().toUpperCase() : draft.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {value.length === 0 && <span className="text-xs text-muted-foreground italic">— ninguno —</span>}
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 pr-1">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded hover:bg-muted-foreground/20 p-0.5">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="h-9"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function StatusIcon({ s }: { s: "pass" | "fail" | "warn" | "skip" }) {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
}

function FitRulesPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(rulesQO);
  const save = useServerFn(saveFitRules);
  const preview = useServerFn(previewFitRules);

  const [r, setR] = useState<FitRules>(data.rules);
  const set = <K extends keyof FitRules>(k: K, v: FitRules[K]) => setR((prev) => ({ ...prev, [k]: v }));

  const mut = useMutation({
    mutationFn: () => save({ data: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fit-rules"] }),
  });
  const prev = useMutation({ mutationFn: () => preview({ data: { rules: r, limit: 20 } }) });

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <header className="max-w-5xl mx-auto mb-6 flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/grants">Grants</Link>
          <Link to="/org">Organization</Link>
          <span className="font-semibold">Fit Rules</span>
        </nav>
      </header>

      <div className="max-w-5xl mx-auto grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Parámetros de evaluación de fit</CardTitle>
              <CardDescription>
                Define cómo se decide si un grant es elegible. Las reglas se combinan con el veredicto del LLM
                según el peso configurado. Los <strong>hard-fail</strong> archivan el grant aunque el LLM lo apruebe.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Score & threshold */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Score combinado</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <Label>Peso del LLM vs reglas</Label>
                    <span className="font-mono">
                      LLM {Math.round(r.weight_llm * 100)}% · reglas {Math.round((1 - r.weight_llm) * 100)}%
                    </span>
                  </div>
                  <Slider min={0} max={1} step={0.05} value={[r.weight_llm]} onValueChange={([v]) => set("weight_llm", v)} />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <Label>Umbral para "fit"</Label>
                    <span className="font-mono">{r.threshold_fit_pass}/100</span>
                  </div>
                  <Slider min={0} max={100} step={5} value={[r.threshold_fit_pass]} onValueChange={([v]) => set("threshold_fit_pass", v)} />
                </div>
              </section>

              <Separator />

              {/* Amounts */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Montos (CAD)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Mínimo aceptable</Label>
                    <Input type="number" min="0" value={r.min_amount_cad ?? ""} placeholder="—"
                      onChange={(e) => set("min_amount_cad", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Máximo aceptable</Label>
                    <Input type="number" min="0" value={r.max_amount_cad ?? ""} placeholder="—"
                      onChange={(e) => set("max_amount_cad", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded border p-2">
                  <Label className="text-xs">Hard-fail si el monto no encaja</Label>
                  <Switch checked={r.hard_fail_on_amount} onCheckedChange={(v) => set("hard_fail_on_amount", v)} />
                </div>
              </section>

              <Separator />

              {/* Jurisdiction */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Jurisdicción</h3>
                <div className="space-y-1">
                  <Label className="text-xs">Requeridas (ISO/prov: CA, ON, QC…)</Label>
                  <Chips value={r.required_jurisdictions} onChange={(v) => set("required_jurisdictions", v)} placeholder="CA" uppercase />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Excluidas</Label>
                  <Chips value={r.excluded_jurisdictions} onChange={(v) => set("excluded_jurisdictions", v)} placeholder="US" uppercase />
                </div>
                <div className="flex items-center justify-between rounded border p-2">
                  <Label className="text-xs">Hard-fail si jurisdicción no encaja</Label>
                  <Switch checked={r.hard_fail_on_jurisdiction} onCheckedChange={(v) => set("hard_fail_on_jurisdiction", v)} />
                </div>
              </section>

              <Separator />

              {/* Sectors */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sectores</h3>
                <div className="space-y-1">
                  <Label className="text-xs">Requeridos (al menos uno debe coincidir)</Label>
                  <Chips value={r.required_sectors} onChange={(v) => set("required_sectors", v)} placeholder="tech" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Excluidos</Label>
                  <Chips value={r.excluded_sectors} onChange={(v) => set("excluded_sectors", v)} placeholder="tobacco" />
                </div>
              </section>

              <Separator />

              {/* Keywords */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Keywords en elegibilidad</h3>
                <div className="space-y-1">
                  <Label className="text-xs">Requeridas (todas deben aparecer)</Label>
                  <Chips value={r.required_keywords} onChange={(v) => set("required_keywords", v)} placeholder="SME" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Excluyentes (ninguna debe aparecer)</Label>
                  <Chips value={r.excluded_keywords} onChange={(v) => set("excluded_keywords", v)} placeholder="non-profit only" />
                </div>
                <div className="flex items-center justify-between rounded border p-2">
                  <Label className="text-xs">Hard-fail si aparece una keyword excluyente</Label>
                  <Switch checked={r.hard_fail_on_excluded_keyword} onCheckedChange={(v) => set("hard_fail_on_excluded_keyword", v)} />
                </div>
              </section>

              <Separator />

              {/* Deadline */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Deadline</h3>
                <div className="space-y-1">
                  <Label className="text-xs">Mínimo de días hasta el deadline</Label>
                  <Input type="number" min="0" value={r.min_days_to_deadline ?? ""} placeholder="—"
                    onChange={(e) => set("min_days_to_deadline", e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className="flex items-center justify-between rounded border p-2">
                  <Label className="text-xs">Hard-fail si quedan menos días</Label>
                  <Switch checked={r.hard_fail_on_deadline} onCheckedChange={(v) => set("hard_fail_on_deadline", v)} />
                </div>
              </section>

              <Separator />

              {/* Behavior */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Comportamiento al fallar</h3>
                <div className="flex items-center justify-between rounded border p-2">
                  <div>
                    <Label className="text-xs">Auto-archivar grants no elegibles</Label>
                    <p className="text-xs text-muted-foreground">Si se desactiva, el grant conserva su estado pero baja su fit_score.</p>
                  </div>
                  <Switch checked={r.auto_archive_on_fail} onCheckedChange={(v) => set("auto_archive_on_fail", v)} />
                </div>
              </section>

              <div className="flex gap-2 pt-4">
                <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
                  {mut.isPending ? "Guardando…" : "Guardar reglas"}
                </Button>
                <Button variant="outline" onClick={() => prev.mutate()} disabled={prev.isPending}>
                  {prev.isPending ? "Simulando…" : "Simular sobre grants actuales"}
                </Button>
                {mut.isSuccess && <span className="self-center text-sm text-green-600">✓ Guardado</span>}
                {mut.isError && <span className="self-center text-sm text-destructive">{(mut.error as Error).message}</span>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview panel */}
        <div className="space-y-3">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-base">Simulación</CardTitle>
              <CardDescription>Aplica las reglas actuales (sin guardar) sobre los grants ya enriquecidos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
              {!prev.data && <p className="text-xs text-muted-foreground">Pulsa "Simular" para ver el impacto.</p>}
              {prev.data?.items.length === 0 && <p className="text-xs text-muted-foreground">No hay grants enriquecidos.</p>}
              {prev.data?.items.map((it) => (
                <div key={it.id} className="rounded border p-2 text-xs space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link to="/grants/$id" params={{ id: it.id }} className="font-medium line-clamp-2 hover:underline">{it.title}</Link>
                    <Badge variant={it.hard_fail ? "destructive" : it.rule_score >= 60 ? "default" : "secondary"} className="shrink-0">
                      {it.rule_score}
                    </Badge>
                  </div>
                  {it.checks.length === 0 ? (
                    <p className="text-muted-foreground italic">sin reglas aplicables</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {it.checks.map((c) => (
                        <li key={c.id} className="flex items-start gap-1.5">
                          <StatusIcon s={c.status} />
                          <span className="flex-1">
                            <span className="font-medium">{c.label}</span>
                            {c.hard && <span className="ml-1 text-[10px] uppercase text-destructive">hard</span>}
                            <span className="block text-muted-foreground">{c.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
