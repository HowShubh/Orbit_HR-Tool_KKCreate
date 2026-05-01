"use client";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { teams, TODAY } from "@/lib/mock-data";
import { activeLeavesOnDate, LEAVE_TYPE_LABELS, LEAVE_TYPE_PILL } from "@/lib/leave-utils";
import { cn } from "@/lib/utils";

export default function TeamPage() {
  const { currentUser, users, leaves, balances } = useStore();

  if (currentUser.role === "employee") {
    return (
      <div className="p-12 text-center text-muted-foreground">
        Team view is for managers, HR and founders.
      </div>
    );
  }

  const visibleUsers =
    currentUser.role === "team_lead"
      ? users.filter((u) => u.manager_id === currentUser.id)
      : users.filter((u) => u.status === "active");

  const todayLeaves = activeLeavesOnDate(leaves, TODAY);

  return (
    <>
      <Topbar
        title="My team"
        subtitle="Today's status and leave balances at a glance"
      />
      <div className="px-5 lg:px-8 py-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleUsers.map((u) => {
            const status = todayLeaves.find((x) => x.user_id === u.id);
            const team = teams.find((t) => t.id === u.primary_team_id);
            const leaveBal = balances.find((b) => b.user_id === u.id && b.type === "leave");
            const wfhBal = balances.find((b) => b.user_id === u.id && b.type === "wfh");
            return (
              <Card key={u.id}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold truncate">{u.full_name}</div>
                      <div className="text-[12px] text-muted-foreground truncate">
                        {u.designation}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge variant="muted">{team?.name}</Badge>
                    {status ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10.5px] font-semibold ring-1 ring-inset",
                          LEAVE_TYPE_PILL[status.type]
                        )}
                      >
                        {LEAVE_TYPE_LABELS[status.type]} today
                      </span>
                    ) : (
                      <Badge variant="success">In office</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border p-2.5">
                      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        Leave
                      </div>
                      <div className="text-[15px] font-semibold tabular-nums">
                        {(leaveBal ? leaveBal.allocated - leaveBal.used : 0).toFixed(1)}{" "}
                        <span className="text-[11px] text-muted-foreground font-normal">
                          / {leaveBal?.allocated ?? 0}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-2.5">
                      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        WFH
                      </div>
                      <div className="text-[15px] font-semibold tabular-nums">
                        {(wfhBal ? wfhBal.allocated - wfhBal.used : 0).toFixed(1)}{" "}
                        <span className="text-[11px] text-muted-foreground font-normal">
                          / {wfhBal?.allocated ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
