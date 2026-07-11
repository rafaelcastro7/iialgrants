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
        </div>

        <DialogFooter>
          {warningMessage && onForceSubmit && (
            <Button
              variant="destructive"
              onClick={() => onForceSubmit(method, confirmationNumber)}
              disabled={loading}
            >
              Submit Anyway
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
