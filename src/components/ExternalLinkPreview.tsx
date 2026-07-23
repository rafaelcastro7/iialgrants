// In-app "internal browser": clicking an external link (grant/funder
// sources, citation evidence) opens a reader-mode preview panel instead of
// navigating away or opening a new tab. True iframing of arbitrary sites
// isn't feasible here — this app's own CSP sets frame-ancestors 'none', and
// most funder/gov sites send their own X-Frame-Options that can't be
// bypassed from the embedding page — so this renders clean extracted text
// (via the same scrape-fallback chain the Discoverer/Enricher use) with a
// prominent, honest "Open original site" action for whatever reader-mode
// can't capture (forms, logins, interactive pages).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink as ExternalLinkIcon, Globe, AlertTriangle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { previewExternalUrl } from "@/lib/external-preview.functions";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Turndown-style markdown from the scrape chain, rendered as safe plain
// text (no dangerouslySetInnerHTML) — a short heading-detection pass is
// enough to give the preview real typographic hierarchy without pulling in
// a markdown-to-HTML renderer this codebase doesn't otherwise use.
function PreviewBody({ markdown }: { markdown: string }) {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const headingMatch = block.match(/^(#{1,3})\s+(.*)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          return (
            <p
              key={i}
              className={
                level === 1
                  ? "text-base font-semibold text-foreground"
                  : "text-sm font-semibold text-foreground"
              }
            >
              {headingMatch[2]}
            </p>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {block.replace(/^#+\s*/, "")}
          </p>
        );
      })}
    </div>
  );
}

export function ExternalLinkPreview({
  url,
  children,
  className,
  showIcon = true,
  title,
}: {
  url: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  // Suppress the trailing indicator icon for icon-only triggers (e.g. a
  // bare <Globe> button) where a second icon would look cluttered.
  showIcon?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const fetchPreview = useServerFn(previewExternalUrl);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["external-preview", url],
    queryFn: () => fetchPreview({ data: { url: url ?? "" } }),
    enabled: open && !!url,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!url) return <span className={className}>{children}</span>;

  return (
    <>
      <button
        type="button"
        title={title}
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1 text-primary hover:underline underline-offset-2 text-left"
        }
      >
        {children}
        {showIcon && (
          <ExternalLinkIcon className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col">
          <SheetHeader className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              {hostnameOf(url)}
            </div>
            <SheetTitle className="text-base leading-snug">
              {isLoading ? <Skeleton className="h-5 w-3/4" /> : (data?.ok ? data.title : null) || "Preview"}
            </SheetTitle>
            <SheetDescription className="text-[11px] break-all font-mono">{url}</SheetDescription>
          </SheetHeader>

          <Separator className="my-3" />

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}

            {!isLoading && (isError || (data && !data.ok)) && (
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center space-y-2">
                <AlertTriangle className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Couldn't load a preview of this page — it may require sign-in or interaction.
                </p>
              </div>
            )}

            {!isLoading && data?.ok && (
              <>
                <PreviewBody markdown={data.markdown} />
                {data.truncated && (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Preview truncated — open the original for the full page.
                  </p>
                )}
              </>
            )}
          </div>

          <Separator className="my-3" />

          <div className="flex items-center justify-between gap-2">
            {!isLoading && data?.ok && (
              <Badge variant="outline" className="text-[10px] font-normal">
                Reader mode · {data.via.replace(/_/g, " ")}
              </Badge>
            )}
            <Button asChild variant="default" size="sm" className="ml-auto gap-1.5">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open original site <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
