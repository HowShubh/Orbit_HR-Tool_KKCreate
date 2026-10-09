"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Notification, User } from "./types";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Global client UI store. As of the 2026-06 mock-data cleanup this holds ONLY
 * real, server-sourced state: the authenticated user, their (real) notifications,
 * and transient toasts. All leave/balance/comp-off data now flows through server
 * components → `lib/queries/*` props, not this store. See docs/MAINTENANCE_NOTES.md.
 */
interface StoreShape {
  currentUser: User;

  notifications: Notification[];
  markNotificationsRead: () => void;
  /** Mark a single notification read (e.g. when the user clicks it). */
  markOneRead: (id: string) => void;

  pushToast: (t: { title: string; body?: string; variant?: "success" | "info" | "error" }) => void;
  toasts: { id: string; title: string; body?: string; variant?: "success" | "info" | "error" }[];
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<StoreShape | null>(null);

/**
 * Placeholder used only for the unauthenticated shell (login/setup), which is
 * wrapped by the root StoreProvider with no realUser and never renders user
 * chrome. Authenticated pages always receive a realUser via AppShell.
 */
const PLACEHOLDER_USER: User = {
  id: "",
  email: "",
  full_name: "",
  role: "employee",
  manager_id: null,
  status: "active",
  joined_at: "",
  designation: "",
  primary_team_id: "",
  team_ids: [],
};

function mapRealNotification(notification: Tables<'notifications'>): Notification {
  return {
    id: notification.id,
    user_id: notification.user_id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link_url: notification.link_url ?? undefined,
    related_entity_type: notification.related_entity_type ?? undefined,
    related_entity_id: notification.related_entity_id ?? undefined,
    read_at: notification.read_at ?? undefined,
    created_at: notification.created_at,
  }
}

export function StoreProvider({
  children,
  realUser,
  realNotifications,
}: {
  children: ReactNode
  realUser?: Tables<'users'>
  realNotifications?: Tables<'notifications'>[]
}) {
  // The authoritative, real logged-in user, built straight from the server
  // record (no mock fallback on email match — that used to render mock
  // roles/names in the chrome).
  const currentUser = useMemo<User>(() => {
    if (!realUser) return PLACEHOLDER_USER
    return {
      id: realUser.id,
      email: realUser.email,
      full_name: realUser.full_name,
      phone: realUser.phone ?? undefined,
      role: realUser.role as User['role'],
      manager_id: realUser.manager_id ?? null,
      status: realUser.status as User['status'],
      joined_at: realUser.joined_at,
      designation: realUser.designation ?? '',
      primary_team_id: '',
      team_ids: [],
      notifications_muted: realUser.notifications_muted ?? undefined,
      photo_url: realUser.photo_url ?? null,
    }
  }, [realUser]);

  const [notifs, setNotifs] = useState<Notification[]>(() =>
    realNotifications ? realNotifications.map(mapRealNotification) : []
  );
  const [toasts, setToasts] = useState<StoreShape["toasts"]>([]);

  useEffect(() => {
    if (realNotifications) {
      setNotifs(realNotifications.map(mapRealNotification))
    }
  }, [realNotifications])

  // Live updates: subscribe to this user's notifications via Supabase Realtime so
  // the bell updates without a navigation/refresh. RLS (user_id = auth.uid())
  // already scopes the stream; we also filter by user_id for efficiency.
  // Requires the table in the supabase_realtime publication — see migration 016.
  const userId = realUser?.id
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Tables<'notifications'>
          setNotifs((prev) =>
            prev.some((n) => n.id === row.id) ? prev : [mapRealNotification(row), ...prev]
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Tables<'notifications'>
          setNotifs((prev) => prev.map((n) => (n.id === row.id ? mapRealNotification(row) : n)))
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const pushToast: StoreShape["pushToast"] = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id)),
    []
  );

  const markNotificationsRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifs((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    void markAllNotificationsRead().catch(() => {
      setNotifs((prev) => prev.map((n) => (n.read_at === now ? { ...n, read_at: undefined } : n)));
    });
  }, []);

  const markOneRead = useCallback((id: string) => {
    const now = new Date().toISOString();
    let wasUnread = false;
    setNotifs((prev) =>
      prev.map((n) => {
        if (n.id !== id || n.read_at) return n;
        wasUnread = true;
        return { ...n, read_at: now };
      })
    );
    if (!wasUnread) return;
    void markNotificationRead(id).catch(() => {
      setNotifs((prev) => prev.map((n) => (n.id === id && n.read_at === now ? { ...n, read_at: undefined } : n)));
    });
  }, []);

  const value = useMemo<StoreShape>(
    () => ({
      currentUser,
      notifications: notifs,
      markNotificationsRead,
      markOneRead,
      pushToast,
      toasts,
      dismissToast,
    }),
    [
      currentUser,
      notifs,
      markNotificationsRead,
      markOneRead,
      pushToast,
      toasts,
      dismissToast,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
