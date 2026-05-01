"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Edit2,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_PILL, rangeLabel } from "@/lib/leave-utils";
import { cn } from "@/lib/utils";
import { teams, TODAY } from "@/lib/mock-data";
import { Role } from "@/lib/types";

export default function HrPage() {
  const { currentUser } = useStore();
  if (currentUser.role !== "hr" && currentUser.role !== "founder") {
    return (
      <div className="p-12 text-center text-muted-foreground">
        HR Console is only available to HR and Founders.
      </div>
    );
  }

  return (
    <>
      <Topbar
        title="HR Console"
        subtitle="Manage leaves, balances, comp-offs and people"
      />
      <div className="px-5 lg:px-8 py-5">
        <Tabs defaultValue="leaves">
          <TabsList className="mb-3">
            <TabsTrigger value="leaves">All Leaves</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="compoff">Comp-off Grants</TabsTrigger>
            <TabsTrigger value="reset">Annual Reset</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="leaves">
            <AllLeavesTab />
          </TabsContent>
          <TabsContent value="balances">
            <BalancesTab />
          </TabsContent>
          <TabsContent value="compoff">
            <CompoffTab />
          </TabsContent>
          <TabsContent value="reset">
            <ResetTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function AllLeavesTab() {
  const { leaves, users, deleteLeave } = useStore();
  const [search, setSearch] = useState("");

  const rows = leaves
    .filter((l) => l.status === "active")
    .filter((l) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const u = users.find((x) => x.id === l.user_id);
      return (
        u?.full_name.toLowerCase().includes(q) ||
        LEAVE_TYPE_LABELS[l.type].toLowerCase().includes(q) ||
        (l.reason ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-4 flex items-center justify-between gap-3 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee, type, reason"
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button>
            <Plus className="h-4 w-4" />
            Backdate leave
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground bg-muted/40">
                <th className="font-medium px-4 py-3">Employee</th>
                <th className="font-medium px-4 py-3">Type</th>
                <th className="font-medium px-4 py-3">Dates</th>
                <th className="font-medium px-4 py-3">Days</th>
                <th className="font-medium px-4 py-3">Reason</th>
                <th className="font-medium px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const u = users.find((x) => x.id === l.user_id);
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u?.full_name ?? "?"} size="sm" />
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium truncate">{u?.full_name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {u?.designation}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset",
                          LEAVE_TYPE_PILL[l.type]
                        )}
                      >
                        {LEAVE_TYPE_LABELS[l.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {rangeLabel(l.start_date, l.end_date)}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{l.days_deducted}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[260px] truncate">
                      {l.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-rose-600"
                        onClick={() => deleteLeave(l.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BalancesTab() {
  const { users, balances, pushToast } = useStore();

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground bg-muted/40">
              <th className="font-medium px-4 py-3">Employee</th>
              <th className="font-medium px-4 py-3">Leave</th>
              <th className="font-medium px-4 py-3">WFH</th>
              <th className="font-medium px-4 py-3">Comp-Leave</th>
              <th className="font-medium px-4 py-3">Comp-WFH</th>
              <th className="font-medium px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users
              .filter((u) => u.status === "active")
              .map((u) => {
                const b = (t: string) =>
                  balances.find((x) => x.user_id === u.id && x.type === t);
                const cell = (type: string) => {
                  const r = b(type);
                  if (!r) return "—";
                  const remaining = (r.allocated - r.used).toFixed(1);
                  return (
                    <span>
                      <span className="font-semibold tabular-nums">{remaining}</span>
                      <span className="text-muted-foreground"> / {r.allocated}</span>
                    </span>
                  );
                };
                return (
                  <tr key={u.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.full_name} size="sm" />
                        <div>
                          <div className="text-[13px] font-medium">{u.full_name}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">
                            {u.role.replace("_", " ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{cell("leave")}</td>
                    <td className="px-4 py-3">{cell("wfh")}</td>
                    <td className="px-4 py-3">{cell("compoff_leave")}</td>
                    <td className="px-4 py-3">{cell("compoff_wfh")}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          pushToast({
                            title: "Edit balances",
                            body: "Inline edit will open here",
                            variant: "info",
                          })
                        }
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CompoffTab() {
  const { compoffGrants, users, decideCompoff, pushToast } = useStore();

  const groups = {
    pending: compoffGrants.filter((g) => g.status === "pending"),
    approved: compoffGrants.filter((g) => g.status === "approved"),
    rejected: compoffGrants.filter((g) => g.status === "rejected"),
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat label="Pending" value={groups.pending.length} tone="warning" />
          <Stat label="Approved" value={groups.approved.length} tone="success" />
          <Stat label="Rejected" value={groups.rejected.length} tone="muted" />
        </div>

        <div className="space-y-3">
          {compoffGrants.map((g) => {
            const u = users.find((x) => x.id === g.user_id);
            const m = users.find((x) => x.id === g.manager_id);
            return (
              <div
                key={g.id}
                className="rounded-xl border border-border p-4 flex flex-wrap items-center gap-4"
              >
                <Avatar name={u?.full_name ?? "?"} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13.5px] font-semibold">{u?.full_name}</span>
                    <span className="text-[11.5px] text-muted-foreground">
                      {LEAVE_TYPE_LABELS[g.type]} · {g.amount} day · worked{" "}
                      {format(parseISO(g.work_date), "MMM d")}
                    </span>
                  </div>
                  <div className="text-[12.5px] text-muted-foreground line-clamp-2 mt-0.5">
                    {g.reason}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground/80 mt-1">
                    Manager: {m?.full_name ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {g.status === "pending" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          decideCompoff(g.id, "rejected");
                          pushToast({ title: "Comp-off rejected", variant: "info" });
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => {
                          decideCompoff(g.id, "approved");
                          pushToast({ title: "Comp-off approved", variant: "success" });
                        }}
                      >
                        Approve
                      </Button>
                    </>
                  ) : (
                    <Badge
                      variant={g.status === "approved" ? "success" : "muted"}
                      className="capitalize"
                    >
                      {g.status}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "warning" | "success" | "muted" }) {
  const cls = {
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    muted: "border-border bg-muted/40 text-muted-foreground",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-4", cls)}>
      <div className="text-[12px] uppercase tracking-wide font-semibold opacity-80">{label}</div>
      <div className="text-[24px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ResetTab() {
  const { pushToast } = useStore();
  const today = new Date(TODAY);
  const isUnlocked = today.getMonth() === 4 && today.getDate() >= 25; // May 25+

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-4">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="text-[14px] font-semibold text-amber-900">
              Annual reset window
            </div>
            <div className="text-[12.5px] text-amber-900/80">
              Available May 25 onward each year. Resets WFH and Leave balances for the
              new fiscal year. Comp-off bank is unaffected.
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">
              FY 2026 – 27
            </div>
            <div className="text-[20px] font-semibold tracking-tight">
              Run Annual Reset
            </div>
            <div className="text-[12.5px] text-muted-foreground">
              Carries forward each user's existing allocation. You can adjust later.
            </div>
          </div>
          <Button
            disabled={!isUnlocked}
            onClick={() =>
              pushToast({
                title: "Reset queued",
                body: "Balances will roll over for FY 2026 – 27",
                variant: "success",
              })
            }
          >
            <CalendarClock className="h-4 w-4" />
            {isUnlocked ? "Run reset now" : "Unlocks May 25"}
          </Button>
        </div>

        <div>
          <div className="text-[13px] font-semibold mb-2">Past resets</div>
          <ul className="space-y-2">
            {[
              { year: "FY 2025-26", actor: "Stewart Joseph", at: "May 27, 2025" },
              { year: "FY 2024-25", actor: "Stewart Joseph", at: "May 26, 2024" },
            ].map((r) => (
              <li
                key={r.year}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-[13px]"
              >
                <div>
                  <div className="font-medium">{r.year}</div>
                  <div className="text-[11.5px] text-muted-foreground">by {r.actor}</div>
                </div>
                <div className="text-[12px] text-muted-foreground">{r.at}</div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function UsersTab() {
  const { users } = useStore();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-4 flex items-center justify-between border-b">
          <div className="text-[13px] text-muted-foreground">
            {users.filter((u) => u.status === "active").length} active people
          </div>
          <Button>
            <UserPlus className="h-4 w-4" />
            New user
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground bg-muted/40">
                <th className="font-medium px-4 py-3">Person</th>
                <th className="font-medium px-4 py-3">Role</th>
                <th className="font-medium px-4 py-3">Manager</th>
                <th className="font-medium px-4 py-3">Teams</th>
                <th className="font-medium px-4 py-3">Joined</th>
                <th className="font-medium px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const manager = users.find((x) => x.id === u.manager_id);
                return (
                  <tr key={u.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.full_name} size="sm" />
                        <div>
                          <div className="text-[13px] font-medium">{u.full_name}</div>
                          <div className="text-[11px] text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <Badge variant={u.role === "founder" ? "warning" : u.role === "hr" ? "info" : "muted"}>
                        {u.role.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{manager?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {u.team_ids.map((tid) => {
                          const t = teams.find((x) => x.id === tid);
                          return (
                            <Badge
                              key={tid}
                              variant={tid === u.primary_team_id ? "default" : "muted"}
                            >
                              {t?.name}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.joined_at).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm">
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
