"use client";

import { addDays, format, formatISO, parseISO, startOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { holidays, teams, TODAY } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { DayCode } from "@/lib/types";

const DAYS: DayCode[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MODE_META = {
  office: {
    label: "Office",
    tile: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-400",
  },
  home: {
    label: "Home",
    tile: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-400",
  },
  holiday: {
    label: "Holiday",
    tile: "border-rose-200 bg-rose-50 text-rose-600",
    dot: "bg-rose-400",
  },
  off: {
    label: "Off",
    tile: "border-border bg-muted/40 text-muted-foreground",
    dot: "bg-slate-300",
  },
};
type ScheduleMode = keyof typeof MODE_META;

export function ScheduleCard() {
  const { currentUser } = useStore();
  const team = teams.find((t) => t.id === currentUser.primary_team_id);
  const wfo = new Set(team?.wfo_pattern ?? []);
  const wfoLabel = team?.wfo_pattern.join(", ") || "Not set";
  const weekStart = startOfWeek(parseISO(TODAY), { weekStartsOn: 1 });
  const week = DAYS.map((code, index) => {
    const date = addDays(weekStart, index);
    const iso = formatISO(date, { representation: "date" });
    const holiday = holidays.find((h) => h.date === iso);
    const isWeekend = code === "SAT" || code === "SUN";
    const mode: ScheduleMode = holiday
      ? "holiday"
      : isWeekend
      ? "off"
      : wfo.has(code)
      ? "office"
      : "home";

    return {
      code,
      date,
      mode,
      detail: holiday?.name ?? MODE_META[mode].label,
    };
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>This week's schedule</CardTitle>
          <div className="text-[12px] text-muted-foreground">
            {team?.name ?? "Your"} team · WFO: {wfoLabel}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {week.map((day) => {
            const isToday = formatISO(day.date, { representation: "date" }) === TODAY;
            return (
              <div
                key={day.code}
                aria-label={`${format(day.date, "EEEE, MMM d")} · ${day.detail}`}
                title={`${format(day.date, "EEE, MMM d")} · ${day.detail}`}
                className={cn(
                  "relative aspect-square rounded-xl border flex items-center justify-center text-[15px] font-bold transition-colors sm:text-base",
                  MODE_META[day.mode].tile,
                  isToday && "ring-2 ring-primary ring-offset-2"
                )}
              >
                {day.code.slice(0, 1)}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
          {(["office", "home", "holiday", "off"] as const).map((mode) => (
            <span key={mode} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", MODE_META[mode].dot)} />
              {MODE_META[mode].label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
