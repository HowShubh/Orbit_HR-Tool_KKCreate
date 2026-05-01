"use client";

import { CalendarPlus, FileText, Sparkles, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog";
import { RequestCompoffDialog } from "@/components/leave/request-compoff-dialog";
import { useStore } from "@/lib/store";

export function QuickActionsCard() {
  const { currentUser } = useStore();
  const isManager =
    currentUser.role === "team_lead" ||
    currentUser.role === "hr" ||
    currentUser.role === "founder";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <ApplyLeaveDialog
            trigger={
              <button className="group rounded-xl border border-border bg-card p-3.5 text-left hover:bg-primary/[0.04] hover:border-primary/30 transition-all">
                <div className="h-8 w-8 grid place-items-center rounded-lg bg-primary/10 text-primary mb-2 group-hover:bg-primary group-hover:text-white transition-colors">
                  <CalendarPlus className="h-4 w-4" />
                </div>
                <div className="text-[13px] font-semibold">Apply leave</div>
                <div className="text-[11.5px] text-muted-foreground">
                  Single or multi-day
                </div>
              </button>
            }
          />
          <RequestCompoffDialog
            trigger={
              <button className="group rounded-xl border border-border bg-card p-3.5 text-left hover:bg-amber-50 hover:border-amber-200 transition-all">
                <div className="h-8 w-8 grid place-items-center rounded-lg bg-amber-50 text-amber-600 mb-2 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-[13px] font-semibold">Comp-off</div>
                <div className="text-[11.5px] text-muted-foreground">
                  Request from manager
                </div>
              </button>
            }
          />
          <a
            href="/calendar"
            className="group rounded-xl border border-border bg-card p-3.5 text-left hover:bg-blue-50 hover:border-blue-200 transition-all"
          >
            <div className="h-8 w-8 grid place-items-center rounded-lg bg-blue-50 text-blue-600 mb-2 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <FileText className="h-4 w-4" />
            </div>
            <div className="text-[13px] font-semibold">Calendar</div>
            <div className="text-[11.5px] text-muted-foreground">Plan around team</div>
          </a>
          {isManager ? (
            <a
              href="/team"
              className="group rounded-xl border border-border bg-card p-3.5 text-left hover:bg-emerald-50 hover:border-emerald-200 transition-all"
            >
              <div className="h-8 w-8 grid place-items-center rounded-lg bg-emerald-50 text-emerald-600 mb-2 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <UserPlus className="h-4 w-4" />
              </div>
              <div className="text-[13px] font-semibold">My team</div>
              <div className="text-[11.5px] text-muted-foreground">Statuses & balances</div>
            </a>
          ) : (
            <a
              href="/org"
              className="group rounded-xl border border-border bg-card p-3.5 text-left hover:bg-emerald-50 hover:border-emerald-200 transition-all"
            >
              <div className="h-8 w-8 grid place-items-center rounded-lg bg-emerald-50 text-emerald-600 mb-2 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <UserPlus className="h-4 w-4" />
              </div>
              <div className="text-[13px] font-semibold">Organization</div>
              <div className="text-[11.5px] text-muted-foreground">Find a teammate</div>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
