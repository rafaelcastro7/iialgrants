import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  FileSearch,
  FileText,
  Hash,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";
import { AppTopBar } from "@/components/AppSidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import manualMarkdown from "../../docs/USER-MANUAL.md?raw";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "User Manual - IIAL Grants" },
      {
        name: "description",
        content: "Professional user manual for the IIAL Grants platform.",
      },
    ],
  }),
  component: UserManualRoute,
});

type Block =
  | { type: "code"; code: string; language: string }
  | { type: "heading"; depth: 1 | 2 | 3 | 4; text: string; id: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

const blocks = parseMarkdown(manualMarkdown);
const headings = blocks.filter(
  (block): block is Extract<Block, { type: "heading" }> =>
    block.type === "heading" && block.depth === 2,
);

function UserManualRoute() {
  const sectionCount = headings.length;

  return (
    <>
      <AppTopBar title="User Manual" />
      <main className="min-h-screen bg-background">
        <section className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <Card className="overflow-hidden rounded-md">
                <CardContent className="p-0">
                  <div className="border-b bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Hash className="h-4 w-4 text-primary" />
                      Contents
                    </div>
                  </div>
                  <nav className="max-h-[calc(100vh-190px)] overflow-auto p-2">
                    {headings.map((heading) => (
                      <a
                        key={heading.id}
                        href={`#${heading.id}`}
                        className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {heading.text}
                      </a>
                    ))}
                  </nav>
                </CardContent>
              </Card>
            </div>
          </aside>

          <article className="min-w-0 space-y-5">
            <section className="rounded-md border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-md gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  User guide
                </Badge>
                <Badge variant="outline" className="rounded-md gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {sectionCount} sections
                </Badge>
                <Badge variant="outline" className="rounded-md gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Updated July 21, 2026
                </Badge>
              </div>
              <h1 className="mt-4 max-w-4xl font-display text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                IIAL Grants User Manual
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                A professional operating guide for discovery, funder intelligence, fit evaluation,
                proposal workflows, post-award management, competitive intelligence, administration,
                and the local autonomous improvement system.
              </p>
            </section>

            <section className="rounded-md border bg-card shadow-sm">
              <div className="manual-article px-5 py-6 sm:px-8 lg:px-10">
                {blocks
                  .filter((block) => !(block.type === "heading" && block.depth === 1))
                  .map((block, index) => (
                    <MarkdownBlock key={index} block={block} />
                  ))}
              </div>
            </section>
          </article>
        </section>
      </main>
    </>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  if (block.type === "heading") {
    const className =
      block.depth === 2
        ? "scroll-mt-24 border-t pt-8 first:border-t-0 first:pt-0 text-2xl font-semibold tracking-normal"
        : block.depth === 3
          ? "scroll-mt-24 pt-5 text-lg font-semibold tracking-normal"
          : "scroll-mt-24 pt-4 text-base font-semibold tracking-normal";
    const Tag = block.depth === 2 ? "h2" : block.depth === 3 ? "h3" : "h4";
    return (
      <Tag id={block.id} className={className}>
        {block.text}
      </Tag>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{renderInline(block.text)}</p>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        className={
          block.ordered
            ? "mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-muted-foreground"
            : "mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground"
        }
      >
        {block.items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "code") {
    if (block.language === "grantflow") {
      return <GrantSearchRulesDiagram />;
    }

    return (
      <pre className="mt-4 overflow-x-auto rounded-md border bg-muted/60 p-4 text-xs leading-6 text-foreground">
        <code>{block.code}</code>
      </pre>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-md border">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead className="bg-muted/60 text-left text-foreground">
          <tr>
            {block.headers.map((header) => (
              <th key={header} className="border-b px-3 py-2 font-semibold">
                {renderInline(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top text-muted-foreground">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const searchFlow = [
  {
    icon: Search,
    title: "1. Search",
    detail: "Keyword, funder, sector, jurisdiction, or known program name.",
  },
  {
    icon: Database,
    title: "2. Candidate record",
    detail: "The system shows matching grants and their current lifecycle status.",
  },
  {
    icon: FileSearch,
    title: "3. Enrichment",
    detail: "Fetches official pages and extracts deadline, amount, eligibility, and requirements.",
  },
  {
    icon: SlidersHorizontal,
    title: "4. Rule validation",
    detail: "Runs deterministic gates before proposal time is committed.",
  },
  {
    icon: CheckCircle2,
    title: "5. Decision",
    detail: "Shortlist, verify manually, draft, archive, or monitor for a later intake.",
  },
];

const ruleCards = [
  {
    code: "F1",
    icon: ShieldCheck,
    title: "Legal eligibility",
    question: "Are we allowed to apply?",
    pass: "Applicant type, geography, and direct/partner rules fit.",
  },
  {
    code: "F3",
    icon: Scale,
    title: "Money math",
    question: "Is the grant financially practical?",
    pass: "Amount, cost-share, reimbursement, and cash-flow are viable.",
  },
  {
    code: "F4",
    icon: Target,
    title: "Strategic fit",
    question: "Does it match what we can credibly deliver?",
    pass: "Sectors, activities, outcomes, and funder priorities align.",
  },
  {
    code: "F5",
    icon: Clock3,
    title: "Deadline runway",
    question: "Do we have enough time?",
    pass: "Deadline or intake timing leaves enough preparation runway.",
  },
];

function GrantSearchRulesDiagram() {
  return (
    <div className="mt-5 rounded-md border bg-gradient-to-br from-primary/10 via-background to-muted/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold tracking-normal">
            Visual map: grant search and rule validation
          </h4>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Use this as the mental model for moving from a broad search result to a source-backed
            pursue / verify / archive decision.
          </p>
        </div>
        <Badge variant="secondary" className="rounded-md">
          Search → Evidence → Rules → Decision
        </Badge>
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-[980px] items-stretch gap-2">
          {searchFlow.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex flex-1 items-center gap-2">
                <div className="min-h-[132px] flex-1 rounded-md border bg-card p-3 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">{step.title}</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                </div>
                {index < searchFlow.length - 1 && (
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {ruleCards.map((rule) => {
          const Icon = rule.icon;
          return (
            <div key={rule.code} className="rounded-md border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <Badge className="rounded-md">{rule.code}</Badge>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">{rule.title}</div>
              <p className="mt-1 text-xs font-medium text-foreground/80">{rule.question}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{rule.pass}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <DecisionBox
          icon={<CheckCircle2 className="h-4 w-4" />}
          title="Pass"
          text="Evidence supports eligibility, money, strategic fit, and runway. Shortlist or draft."
          tone="pass"
        />
        <ArrowRight className="hidden h-5 w-5 self-center text-muted-foreground/60 lg:block" />
        <DecisionBox
          icon={<FileSearch className="h-4 w-4" />}
          title="Review"
          text="One or more fields are unclear. Assign manual verification before proposal work."
          tone="review"
        />
        <ArrowRight className="hidden h-5 w-5 self-center text-muted-foreground/60 lg:block" />
        <DecisionBox
          icon={<Archive className="h-4 w-4" />}
          title="Fail"
          text="A hard blocker exists: ineligible, too late, too small, or off strategy. Archive or monitor."
          tone="fail"
        />
      </div>
    </div>
  );
}

function DecisionBox({
  icon,
  title,
  text,
  tone,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone: "pass" | "review" | "fail";
}) {
  const toneClass =
    tone === "pass"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "review"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";

  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`${match.index}-code`} className="rounded bg-muted px-1 py-0.5 text-xs">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={`${match.index}-link`}
            href={link[2]}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {link[1]}
          </a>,
        );
      }
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parsed: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index++;
      continue;
    }

    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      const language = fence[1] ?? "";
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index]?.startsWith("```")) {
        code.push(lines[index] ?? "");
        index++;
      }
      parsed.push({ type: "code", language, code: code.join("\n") });
      index++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const depth = heading[1].length as 1 | 2 | 3 | 4;
      const text = stripInline(heading[2]);
      parsed.push({ type: "heading", depth, text, id: slugify(text) });
      index++;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableLine(lines[index] ?? "");
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        rows.push(splitTableLine(lines[index] ?? ""));
        index++;
      }
      parsed.push({ type: "table", headers, rows });
      continue;
    }

    const list = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (list) {
      const ordered = /\d+\./.test(list[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
        if (!item || /\d+\./.test(item[2]) !== ordered) break;
        items.push(item[3]);
        index++;
      }
      parsed.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index++;
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !/^(#{1,4})\s+/.test(lines[index] ?? "") &&
      !/^```/.test(lines[index] ?? "") &&
      !/^(\s*)([-*]|\d+\.)\s+/.test(lines[index] ?? "") &&
      !isTableStart(lines, index)
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index++;
    }
    parsed.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return parsed;
}

function isTableStart(lines: string[], index: number) {
  const first = lines[index]?.trim() ?? "";
  const second = lines[index + 1]?.trim() ?? "";
  return first.startsWith("|") && second.startsWith("|") && /^[|:\-\s]+$/.test(second);
}

function splitTableLine(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function stripInline(text: string) {
  return text.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
