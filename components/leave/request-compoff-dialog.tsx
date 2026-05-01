"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const TYPES = [
  { id: "compoff_leave", label: "Add to Leave", description: "Use as paid time off", emoji: "🌴" },
  { id: "compoff_wfh", label: "Add to WFH", description: "Use as a remote day", emoji: "🏠" },
] as const;

export function RequestCompoffDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { currentUser, addCompoffRequest, pushToast, users } = useStore();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"compoff_wfh" | "compoff_leave">("compoff_leave");
  const [workDate, setWorkDate] = useState(format(new Date("2026-04-26"), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(1);

  const manager = users.find((u) => u.id === currentUser.manager_id);

  // Compute expiry
  const expiry = workDate
    ? format(
        new Date(new Date(workDate).getTime() + 90 * 86400000),
        "MMM d, yyyy"
      )
    : "";

  function submit() {
    if (!reason.trim()) return;
    addCompoffRequest({
      id: "cg-" + Math.random().toString(36).slice(2, 8),
      user_id: currentUser.id,
      type,
      amount,
      work_date: workDate,
      reason,
      status: "pending",
      manager_id: currentUser.manager_id ?? "u-stewart",
    });
    pushToast({
      title: "Comp-off requested",
      body: manager ? `Sent to ${manager.full_name} for approval.` : "Sent for approval.",
      variant: "success",
    });
    setReason("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Sparkles className="h-4 w-4" />
            Request Comp-off
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a comp-off</DialogTitle>
          <DialogDescription>
            Worked extra? Earn it back. Comp-off expires 3 months after the work date.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={cn(
                  "text-left rounded-xl border px-3 py-2.5 transition-all",
                  type === t.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <span>{t.emoji}</span>
                  {t.label}
                </div>
                <div className="text-[12px] text-muted-foreground line-clamp-1">
                  {t.description}
                </div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Work date</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-9"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <div className="flex gap-2">
                <Button
                  variant={amount === 0.5 ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAmount(0.5)}
                >
                  Half day
                </Button>
                <Button
                  variant={amount === 1 ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAmount(1)}
                >
                  Full day
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>What did you work on? <span className="text-rose-500">*</span></Label>
            <Textarea
              placeholder="A short note your manager will see…"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="rounded-xl bg-muted/40 border border-border p-3 text-[12.5px] text-muted-foreground">
            Approver:{" "}
            <span className="font-medium text-foreground">
              {manager?.full_name ?? "HR (manager unavailable)"}
            </span>
            <span className="mx-2">•</span>
            Expires:{" "}
            <span className="font-medium text-foreground">{expiry}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!reason.trim()}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
