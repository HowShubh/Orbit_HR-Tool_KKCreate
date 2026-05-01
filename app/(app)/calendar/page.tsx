"use client";

import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, EyeOff, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { activeLeavesOnDate, isHoliday, isWeekend, LEAVE_TYPE_DOT, LEAVE_TYPE_LABELS } from "@/lib/leave-utils";
import { holidays, TODAY } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Avatar, AvatarStack } from "@/components/ui/avatar";

export default function CalendarPage() {
  const { currentUser, leaves, users } = useStore();
  const [cursor, setCursor] = useState(parseISO(TODAY));

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart.toISOString(), gridEnd.toISOString()]);

  const role = currentUser.role;

  function visibleLeavesFor(d: Date) {
    const iso = format(d, "yyyy-MM-dd");
    const all = activeLeavesOnDate(leaves, iso);

    if (role === "hr" || role === "founder") return all;
    if (role === "team_lead") {
      return all.filter((l) => {
        const u = users.find((x) => x.id === l.user_id);
        return u?.manager_id === currentUser.id || l.user_id === currentUser.id;
      });
    }
    // employee: only TODAY shows full visibility (and only WFH/leave)
    if (iso === TODAY) {
      return all.filter((l) => l.type === "wfh" || l.type === "leave");
    }
    return [];
  }

  function totalCountFor(d: Date) {
    const iso = format(d, "yyyy-MM-dd");
    return activeLeavesOnDate(leaves, iso).filter(
      (l) => l.type === "wfh" || l.type === "leave"
    ).length;
  }

  return (
    <>
      <Topbar
        title="Calendar"
        subtitle={
          role === "employee"
            ? "Plan ahead — names show only for today; counts for other days."
            : "Filter by date or person to plan around the team."
        }
      />

      <div className="px-5 lg:px-8 py-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setCursor((c) => addDays(startOfMonth(c), -1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-[18px] font-semibold tracking-tight w-44 text-center">
              {format(cursor, "MMMM yyyy")}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setCursor((c) => addDays(endOfMonth(c), 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCursor(parseISO(TODAY))}
            >
              Today
            </Button>
          </div>

          <div className="hidden md:flex items-center gap-3 text-[11.5px]">
            {(["wfh", "leave", "compoff_wfh", "compoff_leave"] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", LEAVE_TYPE_DOT[t])} />
                {LEAVE_TYPE_LABELS[t]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-leave-holiday" /> Holiday
            </span>
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="px-3 py-2.5 text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)]">
              {days.map((d, i) => {
                const iso = format(d, "yyyy-MM-dd");
                const dayHoliday = holidays.find((h) => h.date === iso);
                const dayLeaves = visibleLeavesFor(d);
                const totalCount = totalCountFor(d);
                const inMonth = isSameMonth(d, cursor);
                const isToday = iso === TODAY;
                const weekendDay = isWeekend(d);
                const namesShown =
                  role === "employee" && iso !== TODAY ? false : true;
                const overflowCount = totalCount - dayLeaves.length;

                return (
                  <div
                    key={i}
                    className={cn(
                      "border-b border-r p-2 flex flex-col gap-1.5 min-h-[110px] relative",
                      !inMonth && "bg-muted/20",
                      weekendDay && "bg-muted/10",
                      dayHoliday && "bg-rose-50/40",
                      isToday && "ring-2 ring-primary ring-inset z-[1]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-[12.5px] font-semibold tabular-nums",
                          !inMonth && "text-muted-foreground/60",
                          isToday && "text-primary"
                        )}
                      >
                        {format(d, "d")}
                      </span>
                      {dayHoliday && (
                        <span className="text-[10px] font-medium text-rose-700 truncate max-w-[80px]">
                          {dayHoliday.name}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {namesShown ? (
                        dayLeaves.slice(0, 3).map((l) => {
                          const u = users.find((x) => x.id === l.user_id);
                          return (
                            <div
                              key={l.id}
                              className="flex items-center gap-1.5 text-[11px] truncate rounded-md px-1.5 py-0.5 bg-card border border-border/60"
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", LEAVE_TYPE_DOT[l.type])} />
                              <span className="truncate">{u?.full_name.split(" ")[0]}</span>
                            </div>
                          );
                        })
                      ) : totalCount > 0 ? (
                        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          {totalCount} away
                        </div>
                      ) : null}
                      {namesShown && overflowCount > 0 && (
                        <div className="text-[10.5px] text-muted-foreground">+{overflowCount} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {role === "employee" && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 flex items-start gap-3 text-[12.5px] text-muted-foreground">
            <EyeOff className="h-4 w-4 mt-0.5 shrink-0" />
            For privacy, you only see today's full names. Other days show how
            many people are out — managers and HR see the full view.
          </div>
        )}
      </div>
    </>
  );
}
