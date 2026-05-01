"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_PILL, rangeLabel } from "@/lib/leave-utils";
import { cn } from "@/lib/utils";
import { TODAY } from "@/lib/mock-data";

export function UpcomingLeavesCard() {
  const { currentUser, leaves } = useStore();
  const upcoming = leaves
    .filter(
      (l) =>
        l.user_id === currentUser.id &&
        l.status === "active" &&
        l.end_date >= TODAY
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming leaves</CardTitle>
        <Link
          href="/leaves"
          className="text-[12px] font-medium text-primary inline-flex items-center gap-1"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-4 text-center">
            No upcoming leaves. Time to plan a break? 🌴
          </div>
        ) : (
          <ul className="divide-y divide-border/60 -my-1">
            {upcoming.map((l) => (
              <li key={l.id} className="py-2.5 flex items-center gap-3">
                <div className="h-9 w-9 grid place-items-center rounded-lg bg-muted text-[11px] font-bold text-muted-foreground">
                  {new Date(l.start_date).getDate()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">
                    {rangeLabel(l.start_date, l.end_date)}
                  </div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    {l.reason ?? "—"}
                  </div>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10.5px] font-semibold ring-1 ring-inset",
                    LEAVE_TYPE_PILL[l.type]
                  )}
                >
                  {LEAVE_TYPE_LABELS[l.type]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
