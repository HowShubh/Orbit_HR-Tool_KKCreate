"use client";

import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, Plus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useStore, useBalanceFor } from "@/lib/store";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_PILL, computeDaysDeducted, isHoliday, isWeekend } from "@/lib/leave-utils";
import { LeaveType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES: { id: LeaveType; label: string; description: string; emoji: string }[] = [
  { id: "wfh", label: "Work from home", description: "I'll be working remotely", emoji: "🏠" },
  { id: "leave", label: "Leave", description: "I'm taking the day off", emoji: "🌴" },
  { id: "compoff_wfh", label: "Comp-off WFH", description: "Use a comp-off as WFH", emoji: "🔁" },
  { id: "compoff_leave", label: "Comp-off Leave", description: "Use a comp-off as leave", emoji: "💫" },
];

interface Props {
  trigger?: React.ReactNode;
  defaultType?: LeaveType;
}

export function ApplyLeaveDialog({ trigger, defaultType }: Props) {
  const { currentUser, addLeave, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeaveType>(defaultType ?? "leave");
  const [start, setStart] = useState(format(new Date("2026-04-29"), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(new Date("2026-04-29"), "yyyy-MM-dd"));
  const [halfStart, setHalfStart] = useState(false);
  const [halfEnd, setHalfEnd] = useState(false);
  const [reason, setReason] = useState("");

  const balance = useBalanceFor(currentUser.id, type);
  const remaining = balance ? balance.allocated - balance.used : 0;
  const days = useMemo(
    () =>
      computeDaysDeducted({
        start_date: start,
        end_date: end,
        half_day_start: halfStart,
        half_day_end: halfEnd,
      }),
    [start, end, halfStart, halfEnd]
  );

  const overBalance = days > remaining;
  const reasonRequired = type === "leave" || type === "compoff_leave";
  const reasonMissing = reasonRequired && reason.trim().length === 0;
  const dateInvalid = !start || !end || end < start;
  const allWeekendOrHoliday = days === 0;

  const canSubmit = !overBalance && !reasonMissing && !dateInvalid && !allWeekendOrHoliday;

  function reset() {
    setType(defaultType ?? "leave");
    setStart(format(new Date("2026-04-29"), "yyyy-MM-dd"));
    setEnd(format(new Date("2026-04-29"), "yyyy-MM-dd"));
    setHalfStart(false);
    setHalfEnd(false);
    setReason("");
  }

  function submit() {
    if (!canSubmit) return;
    addLeave({
      id: "l-" + Math.random().toString(36).slice(2, 8),
      user_id: currentUser.id,
      type,
      start_date: start,
      end_date: end,
      half_day_start: halfStart,
      half_day_end: halfEnd,
      half_day_position: halfStart || halfEnd ? "first_half" : null,
      reason: reason || undefined,
      days_deducted: days,
      status: "active",
      created_by: currentUser.id,
      approval_state: "auto",
    });
    pushToast({
      title: "Leave applied",
      body: `${days} day${days > 1 ? "s" : ""} of ${LEAVE_TYPE_LABELS[type]} added.`,
      variant: "success",
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" />
            Apply for Leave
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Pick a type, dates and a reason. Weekends and holidays don't count.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {/* Type cards */}
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

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Start date</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="start"
                  type="date"
                  className="pl-9"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (e.target.value > end) setEnd(e.target.value);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End date</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="end"
                  type="date"
                  className="pl-9"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Half day toggles */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 cursor-pointer">
              <div>
                <div className="text-[13px] font-medium">Half day on start</div>
                <div className="text-[12px] text-muted-foreground">Counts 0.5</div>
              </div>
              <Switch
                checked={halfStart}
                onCheckedChange={(v) => setHalfStart(Boolean(v))}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 cursor-pointer">
              <div>
                <div className="text-[13px] font-medium">Half day on end</div>
                <div className="text-[12px] text-muted-foreground">Counts 0.5</div>
              </div>
              <Switch
                checked={halfEnd}
                onCheckedChange={(v) => setHalfEnd(Boolean(v))}
              />
            </label>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="reason">
              Reason{" "}
              {reasonRequired ? (
                <span className="text-rose-500">*</span>
              ) : (
                <span className="text-muted-foreground text-[12px]">(optional)</span>
              )}
            </Label>
            <Textarea
              id="reason"
              placeholder={
                reasonRequired
                  ? "Why are you taking this off?"
                  : "Anything we should know? (optional)"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {/* Live preview */}
          <div
            className={cn(
              "rounded-xl border p-3.5 text-[13px] transition-colors",
              overBalance
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : allWeekendOrHoliday
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-emerald-50 border-emerald-200 text-emerald-900"
            )}
          >
            {dateInvalid ? (
              "End date can't be before start date."
            ) : allWeekendOrHoliday ? (
              "All days in this range are weekends or holidays — nothing to deduct."
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  This will deduct{" "}
                  <span className="font-semibold">{days}</span> day{days === 1 ? "" : "s"} from your{" "}
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded ring-1 ring-inset",
                      LEAVE_TYPE_PILL[type]
                    )}
                  >
                    {LEAVE_TYPE_LABELS[type]}
                  </span>{" "}
                  balance.
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wide text-current/60">
                    After
                  </div>
                  <div className="font-semibold">
                    {Math.max(0, remaining - days).toFixed(1)} left
                  </div>
                </div>
              </div>
            )}
            {overBalance && (
              <div className="mt-1 text-[12px]">
                That's more than your remaining balance ({remaining.toFixed(1)}).
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Submit leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
