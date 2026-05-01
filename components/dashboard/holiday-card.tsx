"use client";

import { CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { holidays, TODAY } from "@/lib/mock-data";

export function HolidayCard() {
  const upcoming = holidays
    .filter((h) => h.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const next = upcoming[0];

  return (
    <Card className="bg-gradient-to-br from-fuchsia-50 via-violet-50 to-white border-violet-100">
      <CardHeader>
        <CardTitle>Upcoming holidays</CardTitle>
        <CalendarDays className="h-4 w-4 text-violet-500" />
      </CardHeader>
      <CardContent className="space-y-3">
        {next && (
          <div className="rounded-xl bg-white border border-violet-100 px-4 py-3.5 shadow-sm">
            <div className="text-[12px] uppercase tracking-wider text-violet-600 font-semibold">
              Next holiday
            </div>
            <div className="mt-0.5 text-[19px] font-semibold tracking-tight">
              {next.name}
            </div>
            <div className="text-[13px] text-muted-foreground">
              {format(parseISO(next.date), "EEEE, MMM d, yyyy")}
            </div>
          </div>
        )}
        <ul className="space-y-1.5">
          {upcoming.slice(1).map((h) => (
            <li key={h.id} className="flex items-center justify-between text-[12.5px]">
              <span className="font-medium">{h.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {format(parseISO(h.date), "MMM d")}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
