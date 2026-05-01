"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { Avatar } from "@/components/ui/avatar";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_PILL, activeLeavesOnDate } from "@/lib/leave-utils";
import { cn } from "@/lib/utils";
import { TODAY } from "@/lib/mock-data";

export function WhosOutTodayCard() {
  const { leaves, users } = useStore();
  const todays = activeLeavesOnDate(leaves, TODAY).filter(
    (l) => l.type === "wfh" || l.type === "leave"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who's out today</CardTitle>
        <div className="text-[11.5px] text-muted-foreground">
          {todays.length} {todays.length === 1 ? "person" : "people"}
        </div>
      </CardHeader>
      <CardContent>
        {todays.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-4 text-center">
            Everyone's around today.
          </div>
        ) : (
          <ul className="space-y-2.5 -my-1">
            {todays.map((l) => {
              const u = users.find((x) => x.id === l.user_id);
              if (!u) return null;
              return (
                <li key={l.id} className="flex items-center gap-3">
                  <Avatar name={u.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{u.full_name}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      {u.designation}
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
