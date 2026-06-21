"use client";

import { Menu, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { NotificationsPopover } from "@/components/layout/notifications-popover";
import { MobileNav } from "@/components/layout/mobile-nav";

export function Topbar({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { currentUser } = useStore();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();

  function handleSignOut() {
    startSignOut(async () => {
      await createClient().auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

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
            <DropdownMenuItem
              className="text-destructive"
              disabled={isSigningOut}
              onSelect={(e) => {
                e.preventDefault();
                handleSignOut();
              }}
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
    </header>
  );
}
