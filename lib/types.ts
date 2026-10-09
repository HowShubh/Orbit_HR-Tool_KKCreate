export type Role = "employee" | "team_lead" | "hr" | "founder";

export type LeaveType = "wfh" | "leave" | "compoff_wfh" | "compoff_leave";

export type LeaveStatus = "active" | "pending" | "delete_requested" | "rejected" | "deleted";

export type DayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: Role;
  manager_id?: string | null;
  status: "active" | "exited";
  joined_at: string;
  designation: string;
  primary_team_id: string;
  team_ids: string[];
  notifications_muted?: boolean;
  photo_url?: string | null;
}

export interface Team {
  id: string;
  name: string;
  wfo_pattern: DayCode[];
  team_lead_id: string;
}

export interface Leave {
  id: string;
  user_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  half_day_start?: boolean;
  half_day_end?: boolean;
  half_day_position?: "first_half" | "second_half" | null;
  reason?: string;
  days_deducted: number;
  status: LeaveStatus;
  created_by: string;
  approval_state?: "auto" | "pending" | "approved" | "rejected";
}

export interface LeaveBalance {
  user_id: string;
  leave_year: number;
  type: LeaveType;
  allocated: number;
  used: number;
}

export interface CompoffGrant {
  id: string;
  user_id: string;
  type: "compoff_wfh" | "compoff_leave";
  amount: number;
  work_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  manager_id: string;
  decided_at?: string;
  expires_at?: string; // 3-month expiry from work_date
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_url?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  read_at?: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  diff: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  note?: string;
  created_at: string;
}

export type { CanHelpers } from '@/lib/capabilities/can'
