// Compact "freshness" badges for grant cards: discovered-N-ago + deadline.
// Color encodes urgency (red <7d, amber <30d, slate >30d) and staleness
// (slate after 30d since discovery). Pure presentational, no data fetches.
import { Badge } from "@/components/ui/badge";

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function relTime(iso: string | null, fr: boolean): string {
  if (!iso) return "—";
  const d = daysBetween(new Date(iso), new Date());
  if (d <= 0) return fr ? "aujourd'hui" : "today";
  if (d === 1) return fr ? "hier" : "1d ago";
  if (d < 30) return fr ? `il y a ${d}j` : `${d}d ago`;
  const months = Math.floor(d / 30);
  return fr ? `il y a ${months}m` : `${months}mo ago`;
}

export function FreshnessBadges({
  discoveredAt, deadline, fr,
}: { discoveredAt: string | null; deadline: string | null; fr: boolean }) {
  const ageDays = discoveredAt ? daysBetween(new Date(discoveredAt), new Date()) : null;
  const stale = ageDays != null && ageDays > 30;

  let deadlineLabel: string | null = null;
  let deadlineTone: "destructive" | "default" | "secondary" | "outline" = "outline";
  if (deadline) {
    const dl = daysBetween(new Date(), new Date(deadline));
    if (dl < 0) {
      deadlineLabel = fr ? `Expirée il y a ${-dl}j` : `Expired ${-dl}d ago`;
      deadlineTone = "destructive";
    } else if (dl === 0) {
      deadlineLabel = fr ? "Échéance aujourd'hui" : "Closes today";
      deadlineTone = "destructive";
    } else if (dl <= 7) {
      deadlineLabel = fr ? `Échéance dans ${dl}j` : `Closes in ${dl}d`;
      deadlineTone = "destructive";
    } else if (dl <= 30) {
      deadlineLabel = fr ? `Échéance dans ${dl}j` : `Closes in ${dl}d`;
      deadlineTone = "default";
    } else {
      deadlineLabel = fr ? `Échéance dans ${dl}j` : `Closes in ${dl}d`;
      deadlineTone = "secondary";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {discoveredAt && (
        <Badge variant={stale ? "outline" : "secondary"} className="font-normal text-[10px]">
          {stale ? (fr ? "Périmé" : "Stale") : (fr ? "Frais" : "Fresh")} · {relTime(discoveredAt, fr)}
        </Badge>
      )}
      {deadlineLabel && (
        <Badge variant={deadlineTone} className="font-normal text-[10px]">
          {deadlineLabel}
        </Badge>
      )}
    </div>
  );
}
