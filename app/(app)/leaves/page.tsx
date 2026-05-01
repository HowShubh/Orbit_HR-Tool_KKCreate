"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download, Plus, Search } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog";
import { RequestCompoffDialog } from "@/components/leave/request-compoff-dialog";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_PILL } from "@/lib/leave-utils";
import { TODAY } from "@/lib/mock-data";
import { Leave, LeaveBalance, LeaveType } from "@/lib/types";
import { cn } from "@/lib/utils";

type LeavesTab = "upcoming" | "past" | "all" | "ledger";
type StatusVariant = "success" | "warning" | "danger" | "info" | "muted";

type LogRow = {
  id: string;
  sortDate: string;
  date: string;
  category: string;
  type: LeaveType | "allocation";
  typeLabel: string;
  details: string;
  amount: string;
  status: string;
  statusVariant: StatusVariant;
  expiry: string;
};

const SUMMARY_TYPES: LeaveType[] = ["wfh", "leave", "compoff_wfh", "compoff_leave"];

function formatDays(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function fiscalYearLabel(year: number) {
  return `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

function dateLabel(date: string) {
  return format(parseISO(date), "MMM d, yyyy");
}

function rangeLabel(leave: Leave) {
  const start = dateLabel(leave.start_date);
  if (leave.start_date === leave.end_date) return start;
  return `${start} - ${dateLabel(leave.end_date)}`;
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function makeAllocationRow(balance: LeaveBalance): LogRow {
  return {
    id: `allocation-${balance.type}-${balance.leave_year}`,
    sortDate: `${balance.leave_year}-01-01`,
    date: fiscalYearLabel(balance.leave_year),
    category: "Annual allocation",
    type: "allocation",
    typeLabel: LEAVE_TYPE_LABELS[balance.type],
    details: `${formatDays(balance.allocated)} days credited for ${fiscalYearLabel(
      balance.leave_year
    )}`,
    amount: `+${formatDays(balance.allocated)}`,
    status: "Credited",
    statusVariant: "success",
    expiry: "-",
  };
}

function makeLeaveRow(leave: Leave): LogRow {
  const isCompOff = leave.type === "compoff_wfh" || leave.type === "compoff_leave";
  const rejected = leave.approval_state === "rejected";
  const deleted = leave.status === "deleted";
  const pending = leave.approval_state === "pending";
  const deductsBalance = !rejected && !deleted && !pending;

  const status = rejected
    ? "Rejected"
    : deleted
      ? "Deleted"
      : pending
        ? "Pending"
        : "Confirmed";

  return {
    id: `leave-${leave.id}`,
    sortDate: leave.start_date,
    date: rangeLabel(leave),
    category: rejected
      ? "Leave rejected"
      : deleted
        ? "Leave deleted"
        : isCompOff
          ? "Comp-off deducted"
          : leave.type === "wfh"
            ? "WFH deducted"
            : "Leave deducted",
    type: leave.type,
    typeLabel: LEAVE_TYPE_LABELS[leave.type],
    details: leave.reason ?? "-",
    amount: deductsBalance ? `-${formatDays(leave.days_deducted)}` : "0",
    status,
    statusVariant: rejected || deleted ? "danger" : pending ? "warning" : "info",
    expiry: "-",
  };
}

export default function LeavesPage() {
  const { currentUser, balances, leaves, compoffGrants } = useStore();
  const [tab, setTab] = useState<LeavesTab>("upcoming");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "ledger" || view === "log") {
      setTab("ledger");
    }
  }, []);

  const summary = useMemo(
    () =>
      SUMMARY_TYPES.map((type) => {
        const balance = balances.find((b) => b.user_id === currentUser.id && b.type === type);
        const allocated = balance?.allocated ?? 0;
        const remaining = Math.max(0, allocated - (balance?.used ?? 0));

        return {
          type,
          label: LEAVE_TYPE_LABELS[type],
          allocated,
          remaining,
        };
      }),
    [balances, currentUser.id]
  );

  const logRows = useMemo<LogRow[]>(() => {
    const allocationRows = balances
      .filter(
        (balance) =>
          balance.user_id === currentUser.id &&
          (balance.type === "wfh" || balance.type === "leave")
      )
      .map(makeAllocationRow);

    const leaveRows = leaves
      .filter((leave) => leave.user_id === currentUser.id)
      .map(makeLeaveRow);

    const compoffRows: LogRow[] = compoffGrants
      .filter((grant) => grant.user_id === currentUser.id)
      .map((grant) => {
        const approved = grant.status === "approved";
        const rejected = grant.status === "rejected";
        const sortDate = grant.decided_at ? grant.decided_at.slice(0, 10) : grant.work_date;

        return {
          id: `compoff-${grant.id}`,
          sortDate,
          date: dateLabel(sortDate),
          category: approved
            ? "Comp-off received"
            : rejected
              ? "Comp-off rejected"
              : "Comp-off requested",
          type: grant.type,
          typeLabel: LEAVE_TYPE_LABELS[grant.type],
          details: `Worked ${dateLabel(grant.work_date)}. ${grant.reason}`,
          amount: approved ? `+${formatDays(grant.amount)}` : "0",
          status: approved ? "Approved" : rejected ? "Rejected" : "Pending",
          statusVariant: approved ? "success" : rejected ? "danger" : "warning",
          expiry: grant.expires_at ? dateLabel(grant.expires_at) : "-",
        };
      });

    return [...allocationRows, ...leaveRows, ...compoffRows].sort((a, b) =>
      b.sortDate.localeCompare(a.sortDate)
    );
  }, [balances, compoffGrants, currentUser.id, leaves]);

  const visibleRows = logRows
    .filter((row) => {
      if (tab === "ledger") return true;
      if (row.type === "allocation") return false;
      if (tab === "upcoming") return row.sortDate >= TODAY;
      if (tab === "past") return row.sortDate < TODAY;
      return true;
    })
    .filter((row) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [row.date, row.category, row.typeLabel, row.status, row.expiry, row.details].some(
        (value) => value.toLowerCase().includes(q)
      );
    });

  const downloadCsv = () => {
    const headers = ["Date", "Category", "Type", "Amount", "Status", "Expiry", "Details"];
    const body = logRows.map((row) => [
      row.date,
      row.category,
      row.typeLabel,
      row.amount,
      row.status,
      row.expiry,
      row.details,
    ]);
    const csv = [headers, ...body]
      .map((line) => line.map((cell) => csvEscape(cell)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentUser.full_name.toLowerCase().replaceAll(" ", "-")}-leave-log.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Topbar title="My Leaves" subtitle="Apply, edit and review your complete leave history" />

      <div className="px-5 lg:px-8 py-5 space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summary.map((item) => (
            <Card key={item.type}>
              <CardContent className="p-4">
                <div className="text-[12px] font-medium text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-2 text-[22px] font-semibold tabular-nums text-foreground">
                  {formatDays(item.remaining)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  of {formatDays(item.allocated)} days
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as LeavesTab)}>
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reason or type"
                className="h-9 w-56 rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {tab === "ledger" && (
              <Button variant="outline" size="sm" onClick={downloadCsv}>
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            )}
            <RequestCompoffDialog />
            <ApplyLeaveDialog
              trigger={
                <Button>
                  <Plus className="h-4 w-4" />
                  Apply
                </Button>
              }
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Activity</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Expiry</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        No leave log entries match this view.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => (
                      <tr key={row.id} className="border-t hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3 text-foreground">
                          {row.date}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          {row.category}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {row.type === "allocation" ? (
                            <Badge variant="muted">{row.typeLabel}</Badge>
                          ) : (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                LEAVE_TYPE_PILL[row.type]
                              )}
                            >
                              {row.typeLabel}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
                          {row.amount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant={row.statusVariant}>{row.status}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.expiry}
                        </td>
                        <td className="min-w-[240px] px-4 py-3 text-muted-foreground">
                          {row.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
