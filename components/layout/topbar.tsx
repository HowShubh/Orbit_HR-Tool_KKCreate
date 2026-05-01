"use client";

import { Bell, Menu, Search, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NotificationsPopover } from "@/components/layout/notifications-popover";
import { MobileNav } from "@/components/layout/mobile-nav";

export function Topbar({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { currentUser, setRoleImpersonation } = useStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-sm border-b border-border/60">
      <div className="flex items-center gap-3 px-5 lg:px-8 h-16">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          {title && (
            <div className="text-[18px] font-semibold leading-tight tracking-tight">
              {title}
            </div>
          )}
          {subtitle && (
            <div className="hidden sm:block text-[13px] text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="hidden md:flex relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search teammates, leaves…"
            className="h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Role switcher (demo) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden sm:inline-flex">
              <span className="text-muted-foreground">View as:</span>
              <span className="capitalize font-semibold">
                {currentUser.role.replace("_", " ")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Demo: switch role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(["employee", "team_lead", "hr", "founder"] as Role[]).map((r) => (
              <DropdownMenuItem
                key={r}
                onSelect={() => setRoleImpersonation(r)}
                className={cn("capitalize", currentUser.role === r && "font-semibold")}
              >
                {r.replace("_", " ")}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <NotificationsPopover />

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full hover:bg-muted pl-1 pr-2 py-1 transition-colors">
              <Avatar name={currentUser.full_name} size="sm" />
              <ChevronDown className="h-3.5 w-3.5 opacity-60 hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-2">
              <div className="text-sm font-semibold">{currentUser.full_name}</div>
              <div className="text-xs text-muted-foreground">{currentUser.email}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/profile">Profile</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/settings">Settings</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
    </header>
  );
}
