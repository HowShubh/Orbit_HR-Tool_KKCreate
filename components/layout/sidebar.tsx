"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  Loader2,
  Network,
  ScrollText,
  Settings,
  Sparkles,
  UserCog,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { useCapabilities } from "@/hooks/use-capabilities";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/",            label: "Dashboard",    icon: LayoutDashboard, always: true },
  { href: "/leaves",      label: "My Leaves",    icon: ClipboardList,   always: true },
  { href: "/calendar",    label: "Calendar",     icon: CalendarDays,    always: true },
  { href: "/org",         label: "Organization", icon: Network,         always: true },
  { href: "/team",        label: "My Team",      icon: Users,           cap: "hasTeamAccess" as const },
  { href: "/hr",          label: "HR Console",   icon: UserCog,         cap: "isHROrAbove" as const },
  { href: "/audit",       label: "Audit Log",    icon: History,         cap: "viewAuditLog" as const },
  { href: "/permissions", label: "Permissions",  icon: UserCog,         cap: "manageCapabilities" as const },
] as const;

export function Sidebar({ pendingCompoffCount = 0 }: { pendingCompoffCount?: number }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { currentUser } = useStore();
  const { can } = useCapabilities();

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const isRouteActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const handleNavigate = (href: string) => {
    if (!isRouteActive(href)) {
      setPendingHref(href);
    }
  };

  const visibleNav = NAV.filter((n) => {
    if ('always' in n && n.always) return true
    if ('cap' in n) {
      const capKey = n.cap
      if (capKey === 'hasTeamAccess')       return can.hasTeamAccess
      if (capKey === 'isHROrAbove')         return can.isHROrAbove
      if (capKey === 'viewAuditLog')        return can.viewAuditLog()
      if (capKey === 'manageCapabilities')  return can.manageCapabilities()
    }
    return false
  });


  return (
    <aside className="hidden lg:flex h-screen sticky top-0 w-[252px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-lg">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-white">Orbit HR</div>
          <div className="text-[11px] text-sidebar-foreground/60">KK Create</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-2 overflow-y-auto scrollbar-thin">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          Workspace
        </div>
        <ul className="space-y-0.5">
          {visibleNav.map((item) => {
            const isActive = isRouteActive(item.href);
            const isPending = pendingHref === item.href;
            const Icon = item.icon;
            const showBadge =
              item.href === "/leaves" && pendingCompoffCount > 0 && currentUser.role === "team_lead";
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch
                  onClick={() => handleNavigate(item.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                    isActive || isPending
                      ? "bg-white text-slate-900 shadow-sm font-semibold"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                  )}
                >
                  {isPending ? (
                    <Loader2 className="h-[17px] w-[17px] shrink-0 animate-spin text-violet-600" />
                  ) : (
                    <Icon
                      className={cn(
                        "h-[17px] w-[17px] shrink-0",
                        isActive ? "text-violet-600" : "text-sidebar-foreground/60 group-hover:text-white"
                      )}
                    />
                  )}
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                      {pendingCompoffCount}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          Account
        </div>
        <ul className="space-y-0.5">
          <li>
            <Link
              href="/profile"
              prefetch
              onClick={() => handleNavigate("/profile")}
              aria-current={isRouteActive("/profile") ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                isRouteActive("/profile") || pendingHref === "/profile"
                  ? "bg-white text-slate-900 shadow-sm font-semibold"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
              )}
            >
              {pendingHref === "/profile" ? (
                <Loader2 className="h-[17px] w-[17px] animate-spin text-violet-600" />
              ) : (
                <ScrollText
                  className={cn(
                    "h-[17px] w-[17px]",
                    isRouteActive("/profile")
                      ? "text-violet-600"
                      : "text-sidebar-foreground/60"
                  )}
                />
              )}
              My Profile
            </Link>
          </li>
          <li>
            <Link
              href="/settings"
              prefetch
              onClick={() => handleNavigate("/settings")}
              aria-current={isRouteActive("/settings") ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                isRouteActive("/settings") || pendingHref === "/settings"
                  ? "bg-white text-slate-900 shadow-sm font-semibold"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
              )}
            >
              {pendingHref === "/settings" ? (
                <Loader2 className="h-[17px] w-[17px] animate-spin text-violet-600" />
              ) : (
                <Settings
                  className={cn(
                    "h-[17px] w-[17px]",
                    isRouteActive("/settings")
                      ? "text-violet-600"
                      : "text-sidebar-foreground/60"
                  )}
                />
              )}
              Settings
            </Link>
          </li>
        </ul>
      </nav>

      {/* Footer profile card */}
      <div className="m-3 rounded-xl bg-sidebar-accent/60 p-3 flex items-center gap-3">
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
  );
}
