"use client";

import { format, parseISO } from "date-fns";
import { CalendarCheck, Home, Sparkles } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { LeaveType } from "@/lib/types";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    type: "wfh" as const,
    compoffType: "compoff_wfh" as const,
    label: "WFH",
    compoffLabel: "Comp-off WFH",
    Icon: Home,
    iconWrap: "bg-blue-50 text-blue-600",
    bar: "bg-blue-500",
    subText: "text-blue-700",
  },
  {
    type: "leave" as const,
    compoffType: "compoff_leave" as const,
    label: "Leave",
    compoffLabel: "Comp-off Leave",
    Icon: CalendarCheck,
    iconWrap: "bg-orange-50 text-orange-600",
    bar: "bg-orange-500",
    subText: "text-orange-700",
  },
];

function formatDays(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function getRemainingProgress(remaining: number, allocated: number) {
  if (allocated <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / allocated) * 100));
}

export function BalanceCard() {
  const { currentUser, balances, compoffGrants } = useStore();

  const getBalance = (type: LeaveType) => {
    const balance = balances.find((b) => b.user_id === currentUser.id && b.type === type);
    return {
      allocated: balance?.allocated ?? 0,
      remaining: Math.max(0, (balance?.allocated ?? 0) - (balance?.used ?? 0)),
    };
  };

  const getNextExpiry = (type: "compoff_wfh" | "compoff_leave") => {
    const grant = compoffGrants
      .filter((g) => g.user_id === currentUser.id && g.status === "approved" && g.type === type)
      .sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? ""))[0];

    return grant?.expires_at ? format(parseISO(grant.expires_at), "MMM d") : null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Leave Balance</CardTitle>
        <Link
          href="/leaves?view=ledger"
          className="text-[12px] font-semibold text-primary underline-offset-4 hover:underline"
        >
          View log
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        {GROUPS.map((group) => {
          const main = getBalance(group.type);
          const compoff = getBalance(group.compoffType);
          const nextExpiry = getNextExpiry(group.compoffType);
          const Icon = group.Icon;

          return (
            <div key={group.type} className="space-y-3">
              <div className="flex gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    group.iconWrap
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-foreground">
                        {group.label}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] font-semibold tabular-nums text-muted-foreground">
                        <span className="text-foreground">{formatDays(main.remaining)}</span>
                        {" / "}
                        {formatDays(main.allocated)} days
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", group.bar)}
                      style={{
                        width: `${getRemainingProgress(main.remaining, main.allocated)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="ml-[52px] rounded-lg bg-muted/45 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Sparkles className={cn("h-3.5 w-3.5 shrink-0", group.subText)} />
                    <span className={cn("truncate text-[12px] font-medium", group.subText)}>
                      {group.compoffLabel}
                    </span>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                    {formatDays(compoff.remaining)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {nextExpiry ? `Next expires ${nextExpiry}` : "No active 3-month comp-offs"}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
