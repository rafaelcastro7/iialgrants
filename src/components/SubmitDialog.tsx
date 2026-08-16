import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (method: string, confirmationNumber: string) => void;
  loading?: boolean;
  warningMessage?: string;
  onForceSubmit?: (method: string, confirmationNumber: string) => void;
}

export function SubmitDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
  warningMessage,
  onForceSubmit,
}: SubmitDialogProps) {
  const [method, setMethod] = useState("portal");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [reviewed, setReviewed] = useState(false);

  function handleSubmit() {
    onSubmit(method, confirmationNumber);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Proposal</DialogTitle>
          <DialogDescription>
            Choose your submission method and enter the confirmation details.
          </DialogDescription>
        </DialogHeader>

        {warningMessage && (
          <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            {warningMessage}
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="method">Submission Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portal">Online Portal</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="mail">Mail</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmation">Confirmation Number (optional)</Label>
            <Input
              id="confirmation"
              placeholder="e.g., REF-12345"
              value={confirmationNumber}
              onChange={(e) => setConfirmationNumber(e.target.value)}
            />
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            This proposal contains AI-drafted text. Some funders (e.g. NIH) restrict or require
            disclosure of AI-substantially-authored content, with consequences up to
            disqualification — check this funder's own policy before submitting.
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={reviewed}
              onCheckedChange={(v) => setReviewed(v === true)}
              className="mt-0.5"
            />
            <span>
              I have personally read every section of this proposal and take responsibility for its
              content before it reaches the funder.
            </span>
          </label>
        </div>

        <DialogFooter>
          {warningMessage && onForceSubmit && (
            <Button
              variant="destructive"
              onClick={() => onForceSubmit(method, confirmationNumber)}
              disabled={loading || !reviewed}
            >
              Submit Anyway
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !reviewed}>
            {loading ? "Submitting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
