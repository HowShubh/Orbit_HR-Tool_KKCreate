"use client";

import { format, parseISO } from "date-fns";
import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { LEAVE_TYPE_LABELS } from "@/lib/leave-utils";

export function PendingCompoffCard() {
  const { currentUser, compoffGrants, users, decideCompoff, pushToast } = useStore();
  const pending = compoffGrants.filter(
    (g) => g.status === "pending" && g.manager_id === currentUser.id
  );

  function decide(id: string, decision: "approved" | "rejected", name: string) {
    decideCompoff(id, decision);
    pushToast({
      title: decision === "approved" ? "Comp-off approved" : "Comp-off rejected",
      body: `${name} has been notified.`,
      variant: decision === "approved" ? "success" : "info",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending comp-off requests</CardTitle>
        <Badge variant={pending.length > 0 ? "warning" : "muted"}>{pending.length}</Badge>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-4 text-center">
            Nothing waiting on you.
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((g) => {
              const u = users.find((x) => x.id === g.user_id);
              if (!u) return null;
              return (
                <li
                  key={g.id}
                  className="rounded-xl border border-border/70 p-3 bg-card"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={u.full_name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold">{u.full_name}</span>
                        <span className="text-[11.5px] text-muted-foreground">
                          {LEAVE_TYPE_LABELS[g.type]} · {g.amount} day
                          {g.amount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="text-[12.5px] text-muted-foreground line-clamp-2 mt-0.5">
                        {g.reason}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground/80 mt-1">
                        Worked {format(parseISO(g.work_date), "EEE, MMM d")}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => decide(g.id, "rejected", u.full_name)}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      className="flex-1"
                      onClick={() => decide(g.id, "approved", u.full_name)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
