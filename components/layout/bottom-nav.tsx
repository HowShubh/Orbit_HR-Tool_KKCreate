"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  UserRound,
  Wrench,
} from "lucide-react";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useSite } from "@/lib/contexts/site-context";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const { can } = useCapabilities();
  const site = useSite();

  // HR Console & Audit Log are intentionally not here — they're desktop-only.
  const items =
    site === "lockup"
      ? [
          { href: "/lockup", label: "Gear", icon: Box },
          ...(can.manageEquipment()
            ? [{ href: "/tech", label: "Tech", icon: Wrench }]
            : []),
          { href: "/profile", label: "Me", icon: UserRound },
        ]
      : [
          { href: "/", label: "Home", icon: LayoutDashboard },
          { href: "/leaves", label: "Leaves", icon: ClipboardList },
          { href: "/lockup", label: "Lockup", icon: Box },
          { href: "/calendar", label: "Calendar", icon: CalendarDays },
          { href: "/profile", label: "Me", icon: UserRound },
        ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background border-t border-border/60 pb-[env(safe-area-inset-bottom,0)]">
      <ul className={cn("grid", items.length === 5 ? "grid-cols-5" : items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {items.map((it) => {
          const isActive =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="text-[10.5px] font-medium">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
