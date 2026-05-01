"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { activeLeavesOnDate } from "@/lib/leave-utils";
import { TODAY } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  in_office: { dot: "bg-emerald-500", label: "In office" },
  wfh: { dot: "bg-blue-500", label: "WFH" },
  leave: { dot: "bg-orange-500", label: "On leave" },
  compoff: { dot: "bg-amber-500", label: "Comp-off" },
} as const;

type StatusKey = keyof typeof STATUS_STYLES;

export function MyTeamCard() {
  const { currentUser, leaves, users } = useStore();
  const teamMates = users.filter(
    (u) =>
      u.id !== currentUser.id &&
      u.team_ids.some((tid) => currentUser.team_ids.includes(tid))
  );

  const todaysLeaves = activeLeavesOnDate(leaves, TODAY);

  function statusOf(uid: string): StatusKey {
    const l = todaysLeaves.find((x) => x.user_id === uid);
    if (!l) return "in_office";
    if (l.type === "wfh") return "wfh";
    if (l.type === "leave") return "leave";
    return "compoff";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>My team</CardTitle>
        <Link
          href="/team"
          className="text-[12px] font-medium text-primary inline-flex items-center gap-1"
        >
          View team <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 -my-1">
          {teamMates.slice(0, 6).map((u) => {
            const status = statusOf(u.id);
            const meta = STATUS_STYLES[status];
            return (
              <li key={u.id} className="flex items-center gap-3">
                <Avatar name={u.full_name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{u.full_name}</div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    {u.designation}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
