"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Crown, Mail, Search, Users } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { teams } from "@/lib/mock-data";
import { User } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function OrgPage() {
  const { users } = useStore();
  const [selected, setSelected] = useState<string | null>("u-rahul");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(users.filter((u) => u.role !== "employee").map((u) => u.id))
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const founders = users.filter((u) => u.role === "founder" && u.status === "active");

  const filtered = (children: User[]) => {
    if (!search.trim()) return children;
    const q = search.toLowerCase();
    return children.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.designation.toLowerCase().includes(q)
    );
  };

  const reportsOf = (managerId: string) =>
    users.filter((u) => u.manager_id === managerId && u.status === "active");

  const detail = users.find((u) => u.id === selected);

  return (
    <>
      <Topbar title="Organization" subtitle="Org tree, teams and reporting lines" />

      <div className="px-5 lg:px-8 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, role or designation"
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <Card>
            <CardContent className="py-4">
              <ul className="space-y-1.5">
                {founders.map((f) => (
                  <Node
                    key={f.id}
                    user={f}
                    depth={0}
                    expanded={expanded}
                    toggle={toggle}
                    selected={selected}
                    onSelect={setSelected}
                    reportsOf={reportsOf}
                    filter={filtered}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        <aside className="lg:col-span-4">
          {detail && (
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <Avatar name={detail.full_name} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold tracking-tight truncate">
                      {detail.full_name}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground truncate">
                      {detail.designation}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-[13px]">
                  <Row label="Role">
                    <Badge variant={detail.role === "founder" ? "warning" : detail.role === "hr" ? "info" : "muted"} className="capitalize">
                      {detail.role.replace("_", " ")}
                    </Badge>
                  </Row>
                  <Row label="Email">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {detail.email}
                    </span>
                  </Row>
                  <Row label="Manager">
                    {detail.manager_id ? (
                      <span className="text-foreground">
                        {users.find((u) => u.id === detail.manager_id)?.full_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Row>
                  <Row label="Teams">
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {detail.team_ids.map((tid) => {
                        const t = teams.find((x) => x.id === tid);
                        const primary = tid === detail.primary_team_id;
                        return (
                          <Badge
                            key={tid}
                            variant={primary ? "default" : "muted"}
                          >
                            {t?.name}
                            {primary && " · primary"}
                          </Badge>
                        );
                      })}
                    </div>
                  </Row>
                  <Row label="Joined">
                    <span className="text-muted-foreground">
                      {new Date(detail.joined_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </Row>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground text-[12px] uppercase tracking-wide">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Node({
  user,
  depth,
  expanded,
  toggle,
  selected,
  onSelect,
  reportsOf,
  filter,
}: {
  user: User;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  reportsOf: (id: string) => User[];
  filter: (us: User[]) => User[];
}) {
  const reports = filter(reportsOf(user.id));
  const open = expanded.has(user.id);
  const isLeaf = reports.length === 0;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(user.id)}
        onDoubleClick={() => toggle(user.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(user.id);
          }
        }}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors group cursor-pointer",
          selected === user.id && "bg-primary/[0.06] ring-1 ring-primary/30"
        )}
        style={{ paddingLeft: 8 + depth * 18 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle(user.id);
          }}
          className={cn(
            "h-5 w-5 grid place-items-center rounded text-muted-foreground hover:bg-muted",
            isLeaf && "invisible"
          )}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="relative">
          <Avatar name={user.full_name} size="sm" />
          {user.role === "founder" && (
            <span className="absolute -top-1 -right-1 grid place-items-center h-4 w-4 rounded-full bg-amber-400 ring-2 ring-card">
              <Crown className="h-2.5 w-2.5 text-amber-900" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[13px] font-medium truncate">{user.full_name}</div>
          <div className="text-[11.5px] text-muted-foreground truncate">{user.designation}</div>
        </div>
        {!isLeaf && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" />
            {reports.length}
          </span>
        )}
      </div>
      {open && reports.length > 0 && (
        <ul className="space-y-1.5 mt-1.5 border-l border-dashed border-border ml-[14px]">
          {reports.map((r) => (
            <Node
              key={r.id}
              user={r}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selected={selected}
              onSelect={onSelect}
              reportsOf={reportsOf}
              filter={filter}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
