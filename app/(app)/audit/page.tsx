"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { auditLog } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const ACTION_VARIANT: Record<string, "muted" | "info" | "success" | "warning" | "danger"> = {
  leave_created: "info",
  leave_edited: "warning",
  leave_deleted: "danger",
  leave_backdated: "warning",
  balance_changed: "warning",
  compoff_approved: "success",
  compoff_rejected: "danger",
};

export default function AuditPage() {
  const { users, currentUser } = useStore();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (
    currentUser.role !== "hr" &&
    currentUser.role !== "founder" &&
    currentUser.role !== "team_lead"
  ) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        Audit Log is available to HR, Team Leads and Founders.
      </div>
    );
  }

  const rows = auditLog
    .filter((row) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const actor = users.find((u) => u.id === row.actor_id);
      return (
        row.action.toLowerCase().includes(q) ||
        actor?.full_name.toLowerCase().includes(q) ||
        (row.note ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <>
      <Topbar
        title="Audit Log"
        subtitle="Every privileged change in Orbit, with diffs and notes"
      />
      <div className="px-5 lg:px-8 py-5 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by actor, action, note"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {rows.map((row) => {
                const actor = users.find((u) => u.id === row.actor_id);
                const isOpen = open.has(row.id);
                return (
                  <li key={row.id}>
                    <button
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                      onClick={() => toggle(row.id)}
                    >
                      <Avatar name={actor?.full_name ?? "?"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13.5px] font-semibold">
                            {actor?.full_name}
                          </span>
                          <Badge variant={ACTION_VARIANT[row.action] ?? "muted"} className="font-mono">
                            {row.action}
                          </Badge>
                          <span className="text-[11.5px] text-muted-foreground">
                            on {row.entity_type}
                          </span>
                        </div>
                        {row.note && (
                          <div className="text-[12.5px] text-muted-foreground line-clamp-2 mt-0.5">
                            {row.note}
                          </div>
                        )}
                        <div className="text-[11.5px] text-muted-foreground/80 mt-0.5">
                          {format(parseISO(row.created_at), "MMM d, yyyy · h:mm a")}
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground mt-1" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pl-[60px]">
                        <pre className="rounded-lg bg-slate-950 text-slate-100 text-[12px] p-3 overflow-x-auto font-mono">
                          {JSON.stringify(row.diff, null, 2)}
                        </pre>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
