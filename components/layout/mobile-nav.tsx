"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  Monitor,
  Network,
  Sparkles,
  UserCog,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useSite } from "@/lib/contexts/site-context";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: string[];
  /** shown only when can.manageEquipment() */
  equipmentManager?: boolean;
  desktopOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leaves", label: "My Leaves", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/org", label: "Organization", icon: Network },
  { href: "/lockup", label: "Lockup", icon: Box },
  { href: "/team", label: "My Team", icon: Users, roles: ["team_lead", "hr", "founder"] },
  // Tech Console stays available on mobile — gear management happens at the shelf.
  { href: "/tech", label: "Tech Console", icon: Wrench, equipmentManager: true },
  // HR Console & Audit Log are dense, admin-heavy screens — desktop only.
  { href: "/hr", label: "HR Console", icon: UserCog, roles: ["hr", "founder"], desktopOnly: true },
  { href: "/audit", label: "Audit Log", icon: History, roles: ["hr", "founder", "team_lead"], desktopOnly: true },
];

// The standalone Lockup site shows only the gear surface.
const LOCKUP_SITE_NAV_HREFS = ["/lockup", "/tech"];

export function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const { currentUser } = useStore();
  const { can } = useCapabilities();
  const site = useSite();
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    setNotice(null);
    onOpenChange(false);
  }

  if (!open || typeof document === "undefined") return null;
  const visibleNav = NAV.filter((n) => {
    if (site === "lockup" && !LOCKUP_SITE_NAV_HREFS.includes(n.href)) return false;
    if (n.equipmentManager) return can.manageEquipment();
    return !n.roles || n.roles.includes(currentUser.role);
  });

  // Render via a portal to <body> so the fixed overlay is positioned against the
  // viewport. Otherwise the sticky topbar's `backdrop-blur` establishes a
  // containing block and traps the drawer inside the 64px header.
  return createPortal(
    <div className="lg:hidden fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={close}
      />
      <aside className="relative h-full w-[280px] bg-sidebar text-sidebar-foreground p-5 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {site === "lockup" ? (
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 grid place-items-center shadow-lg">
                <Box className="h-4 w-4 text-white" />
              </div>
            ) : (
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-lg">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-white">
                {site === "lockup" ? "Lockup" : "Orbit HR"}
              </div>
              <div className="text-[11px] text-sidebar-foreground/60">
                {site === "lockup" ? "KK Create · Gear" : "KK Create"}
              </div>
            </div>
          </div>
          <button
            onClick={close}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-sidebar-accent text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {notice && (
          <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-200">
              <Monitor className="h-3.5 w-3.5" />
              {notice} is desktop-only
            </div>
            <p className="mt-1 text-[12px] leading-snug text-amber-100/80">
              This screen has a lot going on, so it&apos;s only available in the web app. Please open
              Orbit on your laptop or desktop.
            </p>
          </div>
        )}

        <nav className="flex-1 space-y-0.5">
          {visibleNav.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;

            if (item.desktopOnly) {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => setNotice(item.label)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-white",
                    notice === item.label && "bg-sidebar-accent text-white"
                  )}
                >
                  <Icon className="h-[17px] w-[17px]" />
                  <span className="flex-1">{item.label}</span>
                  <Monitor className="h-3.5 w-3.5 opacity-60" />
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
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
    </div>,
    document.body
  );
}
