"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  Network,
  Sparkles,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leaves", label: "My Leaves", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/org", label: "Organization", icon: Network },
  { href: "/team", label: "My Team", icon: Users, roles: ["team_lead", "hr", "founder"] },
  { href: "/hr", label: "HR Console", icon: UserCog, roles: ["hr", "founder"] },
  { href: "/audit", label: "Audit Log", icon: History, roles: ["hr", "founder", "team_lead"] },
];

export function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const { currentUser } = useStore();

  if (!open) return null;
  const visibleNav = NAV.filter((n) => !n.roles || n.roles.includes(currentUser.role));

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <aside className="relative h-full w-[280px] bg-sidebar text-sidebar-foreground p-5 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-lg">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-white">Orbit HR</div>
              <div className="text-[11px] text-sidebar-foreground/60">KK Create</div>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-sidebar-accent text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5">
          {visibleNav.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px]",
                  isActive
                    ? "bg-white text-slate-900 font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                )}
              >
                <Icon className="h-[17px] w-[17px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 rounded-xl bg-sidebar-accent/60 p-3 flex items-center gap-3">
          <Avatar name={currentUser.full_name} src={currentUser.photo_url} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">
              {currentUser.full_name}
            </div>
            <div className="truncate text-[11px] text-sidebar-foreground/60 capitalize">
              {currentUser.role.replace("_", " ")}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
