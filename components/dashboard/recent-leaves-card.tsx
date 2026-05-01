"use client";

import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_PILL, rangeLabel } from "@/lib/leave-utils";
import { cn } from "@/lib/utils";

export function RecentLeavesCard({ scope }: { scope: "org" | "team" }) {
  const { currentUser, leaves, users } = useStore();

  let visibleLeaves = leaves.filter((l) => l.status === "active");
  if (scope === "team") {
    visibleLeaves = visibleLeaves.filter((l) => {
      const u = users.find((x) => x.id === l.user_id);
      return u?.manager_id === currentUser.id;
    });
  }

  const sorted = [...visibleLeaves]
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{scope === "org" ? "Recent leaves (org)" : "Team's recent leaves"}</CardTitle>
        <a href="/calendar" className="text-[12px] font-medium text-primary">
          Calendar
        </a>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-4 text-center">No entries.</div>
        ) : (
          <ul className="divide-y divide-border/60 -my-1">
            {sorted.map((l) => {
              const u = users.find((x) => x.id === l.user_id);
              if (!u) return null;
              return (
                <li key={l.id} className="py-2.5 flex items-center gap-3">
                  <Avatar name={u.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{u.full_name}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      {rangeLabel(l.start_date, l.end_date)} · {l.days_deducted} day
                      {l.days_deducted === 1 ? "" : "s"}
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
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
