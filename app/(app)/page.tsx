"use client";

import { format, parseISO } from "date-fns";
import { Topbar } from "@/components/layout/topbar";
import { useStore } from "@/lib/store";
import { TODAY } from "@/lib/mock-data";
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog";
import { RequestCompoffDialog } from "@/components/leave/request-compoff-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { StatusCard } from "@/components/dashboard/status-card";
import { ScheduleCard } from "@/components/dashboard/schedule-card";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { UpcomingLeavesCard } from "@/components/dashboard/upcoming-leaves-card";
import { WhosOutTodayCard } from "@/components/dashboard/whos-out-today-card";
import { MyTeamCard } from "@/components/dashboard/my-team-card";
import { HolidayCard } from "@/components/dashboard/holiday-card";
import { PendingCompoffCard } from "@/components/dashboard/pending-compoff-card";
import { QuickActionsCard } from "@/components/dashboard/quick-actions-card";
import { CompoffStackCard } from "@/components/dashboard/compoff-stack-card";
import { RecentLeavesCard } from "@/components/dashboard/recent-leaves-card";
import { OrgPulseCard } from "@/components/dashboard/org-pulse-card";
import { AnnualResetBanner } from "@/components/dashboard/annual-reset-banner";

export default function DashboardPage() {
  const { currentUser } = useStore();
  const greeting = greet();
  const today = format(parseISO(TODAY), "EEEE, MMM d");
  const role = currentUser.role;

  const subtitle =
    role === "employee"
      ? "Here's what's happening with your work this week."
      : role === "team_lead"
      ? "Here's how your team is doing today."
      : "Here's what's happening across the organization today.";

  return (
    <>
      <Topbar
        title={`${greeting}, ${currentUser.full_name.split(" ")[0]} 👋`}
        subtitle={subtitle}
      />

      <div className="px-5 lg:px-8 py-5 space-y-5">
        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{today}</span> · FY 2026 – 27
          </div>
          <div className="flex items-center gap-2">
            <RequestCompoffDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4" />
                  Request comp-off
                </Button>
              }
            />
            <ApplyLeaveDialog
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Apply for leave
                </Button>
              }
            />
          </div>
        </div>

        {role === "hr" || role === "founder" ? <AnnualResetBanner /> : null}

        {/* Layout per role */}
        {role === "employee" && <EmployeeDashboard />}
        {role === "team_lead" && <TeamLeadDashboard />}
        {(role === "hr" || role === "founder") && <HrDashboard />}
      </div>
    </>
  );
}

function greet() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function EmployeeDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-4 space-y-5">
        <StatusCard />
        <HolidayCard />
      </div>
      <div className="lg:col-span-5 space-y-5">
        <ScheduleCard />
        <BalanceCard />
      </div>
      <div className="lg:col-span-3 space-y-5">
        <QuickActionsCard />
        <WhosOutTodayCard />
      </div>
      <div className="lg:col-span-7 space-y-5">
        <UpcomingLeavesCard />
      </div>
      <div className="lg:col-span-5 space-y-5">
        <CompoffStackCard />
      </div>
      <div className="lg:col-span-12">
        <MyTeamCard />
      </div>
    </div>
  );
}

function TeamLeadDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-8 space-y-5">
        <BalanceCard />
        <PendingCompoffCard />
        <RecentLeavesCard scope="team" />
      </div>
      <div className="lg:col-span-4 space-y-5">
        <OrgPulseCard />
        <HolidayCard />
        <WhosOutTodayCard />
        <UpcomingLeavesCard />
      </div>
    </div>
  );
}

function HrDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-8 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <OrgPulseCard />
          <HolidayCard />
        </div>
        <RecentLeavesCard scope="org" />
        <PendingCompoffCard />
      </div>
      <div className="lg:col-span-4 space-y-5">
        <QuickActionsCard />
        <WhosOutTodayCard />
        <CompoffStackCard />
      </div>
    </div>
  );
}
