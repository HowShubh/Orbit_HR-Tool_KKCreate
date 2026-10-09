"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, parseISO } from "date-fns";

export function NotificationsPopover() {
  const { notifications, markNotificationsRead, markOneRead } = useStore();
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
          <Bell className="h-[18px] w-[18px] text-foreground/80" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid place-items-center h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={10}
          className="z-50 w-[360px] rounded-2xl border bg-popover shadow-xl overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out"
        >
          <div className="flex items-center justify-between p-4 border-b">
            <div className="font-semibold">Notifications</div>
            <button
              onClick={markNotificationsRead}
              className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>
          <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                You're all caught up.
              </div>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const content = (
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          n.read_at ? "bg-transparent" : "bg-primary"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">{n.title}</div>
                        <div className="text-[12.5px] text-muted-foreground line-clamp-2">
                          {n.body}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground/70">
                          {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  )

                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "px-4 py-3 border-b last:border-0 hover:bg-muted/40 transition-colors",
                        !n.read_at && "bg-primary/[0.03]"
                      )}
                    >
                      {n.link_url ? (
                        <Link
                          href={n.link_url}
                          className="block"
                          onClick={() => markOneRead(n.id)}
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="block w-full text-left"
                          onClick={() => markOneRead(n.id)}
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
