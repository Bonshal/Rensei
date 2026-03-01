"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { completeSession, DEFAULT_REVISED_QUALITY, NOT_REVISED_QUALITY } from "@/lib/planner";
import { toast } from "sonner";

interface StudyPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  topicId: string;
  onComplete: () => void;
}

export function StudyPromptDialog({
  open,
  onOpenChange,
  sessionId,
  topicId,
  onComplete,
}: StudyPromptDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleRevised = async (didRevise: boolean) => {
    setLoading(true);
    try {
      const quality = didRevise ? DEFAULT_REVISED_QUALITY : NOT_REVISED_QUALITY;
      await completeSession(sessionId, quality);
      toast.success(
        didRevise
          ? "Session recorded! Next revision scheduled."
          : "Session marked as skipped. Topic will appear again soon."
      );
      onOpenChange(false);
      onComplete();
    } catch (err) {
      toast.error("Failed to update session");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Did you revise?</DialogTitle>
          <DialogDescription>
            Let us know so we can plan your next session accordingly.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-4">
          <Button
            className="flex-1"
            onClick={() => handleRevised(true)}
            disabled={loading}
          >
            Yes, I revised
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleRevised(false)}
            disabled={loading}
          >
            No, I didn&apos;t
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
