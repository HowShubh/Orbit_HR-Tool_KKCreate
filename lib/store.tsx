"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { compoffGrants as seedGrants, leaves as seedLeaves, leaveBalances as seedBalances, notifications as seedNotifs, users } from "./mock-data";
import { CompoffGrant, Leave, LeaveBalance, Notification, Role, User } from "./types";

interface StoreShape {
  currentUser: User;
  setCurrentUser: (u: User) => void;
  setRoleImpersonation: (role: Role) => void;

  users: User[];

  leaves: Leave[];
  addLeave: (l: Leave) => void;
  deleteLeave: (id: string) => void;

  balances: LeaveBalance[];

  compoffGrants: CompoffGrant[];
  addCompoffRequest: (g: CompoffGrant) => void;
  decideCompoff: (id: string, decision: "approved" | "rejected") => void;

  notifications: Notification[];
  markNotificationsRead: () => void;

  pushToast: (t: { title: string; body?: string; variant?: "success" | "info" | "error" }) => void;
  toasts: { id: string; title: string; body?: string; variant?: "success" | "info" | "error" }[];
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<StoreShape | null>(null);

const DEFAULT_USER_ID = "u-rahul";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserRaw] = useState<User>(
    () => users.find((u) => u.id === DEFAULT_USER_ID)!
  );
  const [leaves, setLeaves] = useState<Leave[]>(seedLeaves);
  const [balances, setBalances] = useState<LeaveBalance[]>(seedBalances);
  const [grants, setGrants] = useState<CompoffGrant[]>(seedGrants);
  const [notifs, setNotifs] = useState<Notification[]>(seedNotifs);
  const [toasts, setToasts] = useState<StoreShape["toasts"]>([]);

  const pushToast: StoreShape["pushToast"] = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id)),
    []
  );

  const setCurrentUser = useCallback((u: User) => setCurrentUserRaw(u), []);

  const setRoleImpersonation = useCallback((role: Role) => {
    const candidates: Record<Role, string> = {
      employee: "u-rahul",
      team_lead: "u-leah",
      hr: "u-stewart",
      founder: "u-kabir",
    };
    const next = users.find((u) => u.id === candidates[role]);
    if (next) setCurrentUserRaw(next);
  }, []);

  const addLeave = useCallback((l: Leave) => {
    setLeaves((prev) => [l, ...prev]);
    setBalances((prev) => {
      const lyKey = l.type === "compoff_wfh" || l.type === "compoff_leave" ? 0 : 2026;
      return prev.map((b) =>
        b.user_id === l.user_id && b.type === l.type && b.leave_year === lyKey
          ? { ...b, used: b.used + l.days_deducted }
          : b
      );
    });
  }, []);

  const deleteLeave = useCallback((id: string) => {
    setLeaves((prev) => {
      const target = prev.find((l) => l.id === id);
      if (!target) return prev;
      setBalances((b2) => {
        const lyKey =
          target.type === "compoff_wfh" || target.type === "compoff_leave" ? 0 : 2026;
        return b2.map((b) =>
          b.user_id === target.user_id && b.type === target.type && b.leave_year === lyKey
            ? { ...b, used: Math.max(0, b.used - target.days_deducted) }
            : b
        );
      });
      return prev.map((l) => (l.id === id ? { ...l, status: "deleted" } : l));
    });
  }, []);

  const addCompoffRequest = useCallback((g: CompoffGrant) => {
    setGrants((prev) => [g, ...prev]);
  }, []);

  const decideCompoff = useCallback(
    (id: string, decision: "approved" | "rejected") => {
      setGrants((prev) =>
        prev.map((g) =>
          g.id === id
            ? {
                ...g,
                status: decision,
                decided_at: new Date().toISOString(),
                expires_at:
                  decision === "approved"
                    ? new Date(
                        new Date(g.work_date).getTime() + 90 * 86400000
                      )
                        .toISOString()
                        .slice(0, 10)
                    : g.expires_at,
              }
            : g
        )
      );
      if (decision === "approved") {
        const grant = grants.find((g) => g.id === id);
        if (grant) {
          setBalances((prev) =>
            prev.map((b) =>
              b.user_id === grant.user_id && b.type === grant.type && b.leave_year === 0
                ? { ...b, allocated: b.allocated + grant.amount }
                : b
            )
          );
        }
      }
    },
    [grants]
  );

  const markNotificationsRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifs((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
  }, []);

  const value = useMemo<StoreShape>(
    () => ({
      currentUser,
      setCurrentUser,
      setRoleImpersonation,
      users,
      leaves,
      addLeave,
      deleteLeave,
      balances,
      compoffGrants: grants,
      addCompoffRequest,
      decideCompoff,
      notifications: notifs,
      markNotificationsRead,
      pushToast,
      toasts,
      dismissToast,
    }),
    [
      currentUser,
      setCurrentUser,
      setRoleImpersonation,
      leaves,
      addLeave,
      deleteLeave,
      balances,
      grants,
      addCompoffRequest,
      decideCompoff,
      notifs,
      markNotificationsRead,
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

export function useBalanceFor(userId: string, type: string) {
  const { balances } = useStore();
  return balances.find(
    (b) =>
      b.user_id === userId &&
      b.type === type &&
      (type.startsWith("compoff") ? b.leave_year === 0 : true)
  );
}
