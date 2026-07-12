"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { resetDemoData } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ResetDemoButton() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  function handleReset() {
    setBusy(true);
    resetDemoData();
    // Reload so every screen re-fetches from the freshly seeded store.
    window.location.reload();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted"
        >
          <RotateCcw className="size-4" />
          Reset demo data
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Reset demo data?"
        description="This clears all products and orders from this browser and restores the original seed data. Any changes you've made will be lost."
      >
        <div className="mt-2 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            onClick={handleReset}
          >
            Reset data
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
