"use client";

import { differenceInDays, format, parseISO } from "date-fns";
import { AlertCircle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { TODAY } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function CompoffStackCard() {
  const { currentUser, compoffGrants } = useStore();
  const today = parseISO(TODAY);

  const myGrants = compoffGrants
    .filter((g) => g.user_id === currentUser.id && g.status === "approved")
    .sort((a, b) =>
      (a.expires_at ?? "").localeCompare(b.expires_at ?? "")
    );

  const totalActive = myGrants.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comp-off bank</CardTitle>
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          {totalActive} active
        </div>
      </CardHeader>
      <CardContent>
        {myGrants.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-4 text-center">
            No comp-off in your bank yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {myGrants.map((g) => {
              const exp = g.expires_at ? parseISO(g.expires_at) : null;
              const daysLeft = exp ? differenceInDays(exp, today) : null;
              const expiringSoon = daysLeft !== null && daysLeft <= 30;
              return (
                <li
                  key={g.id}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3",
                    expiringSoon
                      ? "border-amber-200 bg-amber-50"
                      : "border-border bg-card"
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold flex items-center gap-2">
                      {g.amount} day {g.type === "compoff_wfh" ? "WFH" : "Leave"}
                      {expiringSoon && (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      )}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      Earned {format(parseISO(g.work_date), "MMM d")}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={cn(
                        "text-[11px] font-semibold",
                        expiringSoon ? "text-amber-700" : "text-muted-foreground"
                      )}
                    >
                      {daysLeft !== null
                        ? daysLeft <= 0
                          ? "Expired"
                          : `${daysLeft}d left`
                        : "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70">
                      Exp {exp ? format(exp, "MMM d") : "—"}
                    </div>
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
