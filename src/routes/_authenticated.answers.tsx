import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, BookOpenCheck, CheckCircle2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  archiveAnswerLibraryItem,
  listAnswerLibrary,
  saveAnswerLibraryItem,
} from "@/lib/answer-library.functions";
import { PageTransition } from "@/components/PageTransition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/answers")({
  head: () => ({ meta: [{ title: "Answer Library â€” IIAL" }] }),
  component: AnswerLibraryPage,
});

type Answer = {
  id: string;
  label: string;
  question: string | null;
  answer_en: string;
  answer_fr: string | null;
  tags: string[];
  evidence_notes: string | null;
  verified_at: string | null;
  use_count: number;
  last_used_at: string | null;
  updated_at: string;
};

const EMPTY = {
  id: undefined as string | undefined,
  label: "",
  question: "",
  answer_en: "",
  answer_fr: "",
  tags: "",
  evidence_notes: "",
  verified: false,
};

function AnswerLibraryPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listAnswerLibrary);
  const save = useServerFn(saveAnswerLibraryItem);
  const archive = useServerFn(archiveAnswerLibraryItem);
  const { data, isLoading } = useQuery({
    queryKey: ["answer-library"],
    queryFn: () => list(),
  });
  const answers = useMemo(() => (data?.answers ?? []) as Answer[], [data?.answers]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(EMPTY);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return answers;
    return answers.filter((answer) =>
      [answer.label, answer.question, answer.answer_en, ...answer.tags]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [answers, search]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: draft.id,
          label: draft.label,
          question: draft.question || null,
          answer_en: draft.answer_en,
          answer_fr: draft.answer_fr || null,
          tags: csv(draft.tags),
          evidence_notes: draft.evidence_notes || null,
          verified: draft.verified,
        },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["answer-library"] });
      setDraft(EMPTY);
      if (result.indexed) toast.success("Answer saved and indexed for drafting");
      else
        toast.warning("Answer saved; semantic indexing will retry when embeddings are available");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["answer-library"] });
      setDraft(EMPTY);
      toast.success("Answer archived");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not archive"),
  });

  function edit(answer: Answer) {
    setDraft({
      id: answer.id,
      label: answer.label,
      question: answer.question ?? "",
      answer_en: answer.answer_en,
      answer_fr: answer.answer_fr ?? "",
      tags: answer.tags.join(", "),
      evidence_notes: answer.evidence_notes ?? "",
      verified: Boolean(answer.verified_at),
    });
  }

  return (
    <PageTransition>
      <section className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Proposal knowledge
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Answer library</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Keep approved IIAL language once, verify its evidence, and let the writer retrieve it
              for future applications.
            </p>
          </div>
          <Button variant="outline" onClick={() => setDraft(EMPTY)}>
            <Plus className="mr-2 h-4 w-4" /> New answer
          </Button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]">
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search labels, questions, answers, or tags"
                  className="pl-9"
                />
              </div>
              <div className="mt-4 space-y-3">
                {isLoading && (
                  <p className="text-sm text-muted-foreground">Loading approved languageâ€¦</p>
                )}
                {!isLoading && filtered.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <BookOpenCheck className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 font-semibold">No reusable answers yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start with organizational history, capacity, equity, evaluation, and
                      sustainability.
                    </p>
                  </div>
                )}
                {filtered.map((answer) => (
                  <button
                    key={answer.id}
                    type="button"
                    onClick={() => edit(answer)}
                    className="block w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold">{answer.label}</h2>
                      {answer.verified_at ? (
                        <Badge variant="secondary">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline">Needs verification</Badge>
                      )}
                    </div>
                    {answer.question && (
                      <p className="mt-1 text-sm text-muted-foreground">{answer.question}</p>
                    )}
                    <p className="mt-2 line-clamp-3 text-sm leading-6">{answer.answer_en}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {answer.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit lg:sticky lg:top-20">
            <CardContent className="space-y-4 pt-6">
              <div>
                <h2 className="text-lg font-semibold">
                  {draft.id ? "Edit reusable answer" : "Add reusable answer"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only mark text verified after checking its claims and evidence.
                </p>
              </div>
              <Field label="Label">
                <Input
                  value={draft.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  placeholder="Organizational capacity"
                />
              </Field>
              <Field label="Question or use case">
                <Textarea
                  rows={2}
                  value={draft.question}
                  onChange={(event) => setDraft({ ...draft, question: event.target.value })}
                />
              </Field>
              <Field label="Approved English answer">
                <Textarea
                  rows={10}
                  value={draft.answer_en}
                  onChange={(event) => setDraft({ ...draft, answer_en: event.target.value })}
                />
              </Field>
              <Field label="French answer (optional)">
                <Textarea
                  rows={5}
                  value={draft.answer_fr}
                  onChange={(event) => setDraft({ ...draft, answer_fr: event.target.value })}
                />
              </Field>
              <Field label="Tags" hint="Comma-separated">
                <Input
                  value={draft.tags}
                  onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                  placeholder="capacity, history, partnerships"
                />
              </Field>
              <Field label="Evidence / source notes">
                <Textarea
                  rows={3}
                  value={draft.evidence_notes}
                  onChange={(event) => setDraft({ ...draft, evidence_notes: event.target.value })}
                  placeholder="Annual report 2025, pp. 4â€“6"
                />
              </Field>
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={draft.verified}
                  onCheckedChange={(value) => setDraft({ ...draft, verified: value === true })}
                  className="mt-0.5"
                />
                <span>
                  <strong>Verified for reuse.</strong>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    I checked this language against current IIAL evidence.
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap justify-between gap-2">
                {draft.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate(draft.id!)}
                  >
                    <Archive className="mr-2 h-4 w-4" /> Archive
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  disabled={
                    saveMutation.isPending ||
                    draft.label.trim().length < 2 ||
                    draft.answer_en.trim().length < 20
                  }
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? "Saving and indexingâ€¦" : "Save to library"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </PageTransition>
  );
}

function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function csv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
