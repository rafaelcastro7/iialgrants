import { useState } from "react";
import { Bookmark, Check, EyeOff, RotateCcw, ThumbsDown } from "lucide-react";
import type { GrantRowData } from "@/components/grants/GrantRow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type GrantFeedbackAction = "saved" | "hidden" | "rejected" | "restored" | "pursued";
export type GrantFeedbackReason =
  | "applicant_type"
  | "jurisdiction"
  | "sector"
  | "population"
  | "funding_use"
  | "amount"
  | "deadline"
  | "capacity"
  | "duplicate"
  | "not_a_grant"
  | "other";

export type GrantFeedbackDecision = {
  action: GrantFeedbackAction;
  reason?: GrantFeedbackReason | null;
  note?: string | null;
};

const REASONS: Array<{ value: GrantFeedbackReason; label: string }> = [
  { value: "applicant_type", label: "Applicant type" },
  { value: "jurisdiction", label: "Jurisdiction" },
  { value: "sector", label: "Sector" },
  { value: "population", label: "Population served" },
  { value: "funding_use", label: "Funding use" },
  { value: "amount", label: "Amount" },
  { value: "deadline", label: "Deadline" },
  { value: "capacity", label: "Capacity" },
  { value: "duplicate", label: "Duplicate" },
  { value: "not_a_grant", label: "Not a grant" },
  { value: "other", label: "Other" },
];

export function GrantFeedbackControls({
  grant,
  onFeedback,
  compact = false,
}: {
  grant: GrantRowData;
  onFeedback: (grant: GrantRowData, decision: GrantFeedbackDecision) => void;
  compact?: boolean;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState<GrantFeedbackReason>("other");
  const [note, setNote] = useState("");
  const dismissed = grant.feedbackAction === "hidden" || grant.feedbackAction === "rejected";

  if (dismissed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() => onFeedback(grant, { action: "restored" })}
      >
        <RotateCcw className="h-3.5 w-3.5" /> Restore
      </Button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1" aria-label={`Feedback for ${grant.title}`}>
        <Button
          type="button"
          variant={grant.feedbackAction === "saved" ? "secondary" : "outline"}
          size="sm"
          className="gap-1"
          onClick={() => onFeedback(grant, { action: "saved" })}
        >
          <Bookmark className="h-3.5 w-3.5" /> {compact ? "Save" : "Save"}
        </Button>
        <Button
          type="button"
          variant={grant.feedbackAction === "pursued" ? "secondary" : "outline"}
          size="sm"
          className="gap-1"
          onClick={() => onFeedback(grant, { action: "pursued" })}
        >
          <Check className="h-3.5 w-3.5" /> Pursue
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => onFeedback(grant, { action: "hidden" })}
        >
          <EyeOff className="h-3.5 w-3.5" /> Hide
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => setRejectOpen(true)}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Not relevant
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why is this grant not relevant?</DialogTitle>
            <DialogDescription>
              This applies only to the selected project profile and can be restored later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`feedback-reason-${grant.id}`}>Reason</Label>
              <select
                id={`feedback-reason-${grant.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value as GrantFeedbackReason)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {REASONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`feedback-note-${grant.id}`}>Optional note</Label>
              <Textarea
                id={`feedback-note-${grant.id}`}
                value={note}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onFeedback(grant, { action: "rejected", reason, note: note.trim() || null });
                setRejectOpen(false);
                setNote("");
              }}
            >
              Record feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
