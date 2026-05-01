"use client";

import { Briefcase, CalendarDays, Clock, Home, Palmtree, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activeLeavesOnDate } from "@/lib/leave-utils";
import { holidays, teams, TODAY } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { DayCode } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAYS: DayCode[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function StatusCard() {
  const { currentUser, leaves } = useStore();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const todayDate = parseISO(TODAY);
  const todayCode = DAYS[(todayDate.getDay() + 6) % 7];
  const team = teams.find((t) => t.id === currentUser.primary_team_id);

  const status = useMemo(() => {
    const todaysLeave = activeLeavesOnDate(leaves, TODAY).find(
      (leave) => leave.user_id === currentUser.id
    );
    const holiday = holidays.find((h) => h.date === TODAY);
    const isWeekend = todayCode === "SAT" || todayCode === "SUN";

    if (todaysLeave?.type === "leave") {
      return {
        label: "On Leave",
        detail: "Leave logged for today",
        Icon: Palmtree,
        tone: "border-orange-200 bg-orange-50 text-orange-800",
      };
    }

    if (todaysLeave?.type === "compoff_leave") {
      return {
        label: "Comp-off Leave",
        detail: "Comp-off leave logged for today",
        Icon: Sparkles,
        tone: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    if (todaysLeave?.type === "wfh" || todaysLeave?.type === "compoff_wfh") {
      return {
        label: todaysLeave.type === "compoff_wfh" ? "Comp-off WFH" : "Working from Home",
        detail:
          todaysLeave.type === "compoff_wfh"
            ? "Comp-off WFH logged for today"
            : "WFH logged for today",
        Icon: Home,
        tone: "border-blue-200 bg-blue-50 text-blue-800",
      };
    }

    if (holiday) {
      return {
        label: "Holiday",
        detail: holiday.name,
        Icon: Palmtree,
        tone: "border-rose-200 bg-rose-50 text-rose-700",
      };
    }

    if (isWeekend) {
      return {
        label: "Off",
        detail: "Weekend / non-working day",
        Icon: Clock,
        tone: "border-slate-200 bg-slate-50 text-slate-700",
      };
    }

    if (team?.wfo_pattern.includes(todayCode)) {
      return {
        label: "Working from Office",
        detail: `${team.name} team schedule`,
        Icon: Briefcase,
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    }

    return {
      label: "Working from Home",
      detail: `${team?.name ?? "Your"} team schedule`,
      Icon: Home,
      tone: "border-blue-200 bg-blue-50 text-blue-800",
    };
  }, [currentUser.id, leaves, team, todayCode]);

  const StatusIcon = status.Icon;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>My Status</CardTitle>
          <div className="text-[12px] text-muted-foreground">Today</div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <div className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(todayDate, "EEEE, MMM d, yyyy")}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span suppressHydrationWarning>{format(now, "h:mm a")}</span>
            </div>
          </div>

          <div
            className={cn(
              "mt-4 flex items-center gap-3 rounded-lg border px-3 py-3",
              status.tone
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/75">
              <StatusIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-tight">{status.label}</div>
              <div className="mt-0.5 text-[12px] opacity-75">{status.detail}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
