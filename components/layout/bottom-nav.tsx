"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, LayoutDashboard, Network, UserCog } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const { currentUser } = useStore();
  const hrLink = currentUser.role === "hr" || currentUser.role === "founder";

  const items = [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/leaves", label: "Leaves", icon: ClipboardList },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/org", label: "Org", icon: Network },
    hrLink
      ? { href: "/hr", label: "HR", icon: UserCog }
      : { href: "/profile", label: "Me", icon: UserCog },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background border-t border-border/60 pb-[env(safe-area-inset-bottom,0)]">
      <ul className="grid grid-cols-5">
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
