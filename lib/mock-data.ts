import {
  AuditEntry,
  CompoffGrant,
  Holiday,
  Leave,
  LeaveBalance,
  Notification,
  Team,
  User,
} from "./types";

// ---------- Teams ----------
export const teams: Team[] = [
  { id: "t-design", name: "Design", wfo_pattern: ["MON", "WED", "FRI"], team_lead_id: "u-leah" },
  { id: "t-engineering", name: "Engineering", wfo_pattern: ["TUE", "THU"], team_lead_id: "u-arjun" },
  { id: "t-content", name: "Content", wfo_pattern: ["MON", "TUE", "WED", "THU", "FRI"], team_lead_id: "u-priya" },
  { id: "t-ops", name: "Operations", wfo_pattern: ["MON", "WED", "FRI"], team_lead_id: "u-priya" },
];

// ---------- Users ----------
export const users: User[] = [
  // Founders
  {
    id: "u-kabir",
    email: "kabir@kkcreate.com",
    full_name: "Kabir Kapoor",
    role: "founder",
    manager_id: null,
    status: "active",
    joined_at: "2018-04-01",
    designation: "Founder",
    primary_team_id: "t-design",
    team_ids: ["t-design"],
  },
  {
    id: "u-meera",
    email: "meera@kkcreate.com",
    full_name: "Meera Krishnan",
    role: "founder",
    manager_id: null,
    status: "active",
    joined_at: "2018-04-01",
    designation: "Co-Founder",
    primary_team_id: "t-engineering",
    team_ids: ["t-engineering"],
  },

  // HR
  {
    id: "u-stewart",
    email: "stewart@kkcreate.com",
    full_name: "Stewart Joseph",
    role: "hr",
    manager_id: "u-meera",
    status: "active",
    joined_at: "2020-08-15",
    designation: "Head of People",
    primary_team_id: "t-ops",
    team_ids: ["t-ops"],
  },

  // Team leads
  {
    id: "u-leah",
    email: "leah@kkcreate.com",
    full_name: "Leah Mathews",
    role: "team_lead",
    manager_id: "u-kabir",
    status: "active",
    joined_at: "2021-02-01",
    designation: "Design Lead",
    primary_team_id: "t-design",
    team_ids: ["t-design"],
  },
  {
    id: "u-arjun",
    email: "arjun@kkcreate.com",
    full_name: "Arjun Mehta",
    role: "team_lead",
    manager_id: "u-meera",
    status: "active",
    joined_at: "2020-11-10",
    designation: "Engineering Lead",
    primary_team_id: "t-engineering",
    team_ids: ["t-engineering"],
  },
  {
    id: "u-priya",
    email: "priya@kkcreate.com",
    full_name: "Priya Iyer",
    role: "team_lead",
    manager_id: "u-kabir",
    status: "active",
    joined_at: "2021-06-20",
    designation: "Content & Ops Lead",
    primary_team_id: "t-content",
    team_ids: ["t-content", "t-ops"],
  },

  // Employees - Design
  {
    id: "u-rahul",
    email: "rahul@kkcreate.com",
    full_name: "Rahul Sharma",
    role: "employee",
    manager_id: "u-leah",
    status: "active",
    joined_at: "2023-03-15",
    designation: "Senior Product Designer",
    primary_team_id: "t-design",
    team_ids: ["t-design"],
  },
  {
    id: "u-ananya",
    email: "ananya@kkcreate.com",
    full_name: "Ananya Verma",
    role: "employee",
    manager_id: "u-leah",
    status: "active",
    joined_at: "2023-09-01",
    designation: "UI Designer",
    primary_team_id: "t-design",
    team_ids: ["t-design"],
  },
  {
    id: "u-rohit",
    email: "rohit@kkcreate.com",
    full_name: "Rohit Desai",
    role: "employee",
    manager_id: "u-leah",
    status: "active",
    joined_at: "2024-01-08",
    designation: "Visual Designer",
    primary_team_id: "t-design",
    team_ids: ["t-design"],
  },

  // Employees - Engineering
  {
    id: "u-saanvi",
    email: "saanvi@kkcreate.com",
    full_name: "Saanvi Rao",
    role: "employee",
    manager_id: "u-arjun",
    status: "active",
    joined_at: "2022-07-12",
    designation: "Senior Frontend Engineer",
    primary_team_id: "t-engineering",
    team_ids: ["t-engineering"],
  },
  {
    id: "u-vikram",
    email: "vikram@kkcreate.com",
    full_name: "Vikram Bhatt",
    role: "employee",
    manager_id: "u-arjun",
    status: "active",
    joined_at: "2023-05-22",
    designation: "Backend Engineer",
    primary_team_id: "t-engineering",
    team_ids: ["t-engineering"],
  },
  {
    id: "u-isha",
    email: "isha@kkcreate.com",
    full_name: "Isha Pillai",
    role: "employee",
    manager_id: "u-arjun",
    status: "active",
    joined_at: "2024-02-14",
    designation: "Full-stack Engineer",
    primary_team_id: "t-engineering",
    team_ids: ["t-engineering", "t-design"],
  },

  // Employees - Content
  {
    id: "u-neha",
    email: "neha@kkcreate.com",
    full_name: "Neha Bansal",
    role: "employee",
    manager_id: "u-priya",
    status: "active",
    joined_at: "2022-11-03",
    designation: "Content Strategist",
    primary_team_id: "t-content",
    team_ids: ["t-content"],
  },
  {
    id: "u-aditya",
    email: "aditya@kkcreate.com",
    full_name: "Aditya Khanna",
    role: "employee",
    manager_id: "u-priya",
    status: "active",
    joined_at: "2023-12-01",
    designation: "Copywriter",
    primary_team_id: "t-content",
    team_ids: ["t-content"],
  },
];

export const currentUserId = "u-rahul"; // default impersonation

// ---------- Today / fixed clock ----------
export const TODAY = "2026-04-28";

// ---------- Holidays ----------
export const holidays: Holiday[] = [
  { id: "h1", date: "2026-04-14", name: "Ambedkar Jayanti" },
  { id: "h2", date: "2026-04-27", name: "Holi" },
  { id: "h3", date: "2026-05-01", name: "Labour Day" },
  { id: "h4", date: "2026-05-25", name: "Buddha Purnima" },
  { id: "h5", date: "2026-08-15", name: "Independence Day" },
  { id: "h6", date: "2026-10-02", name: "Gandhi Jayanti" },
  { id: "h7", date: "2026-11-12", name: "Diwali" },
  { id: "h8", date: "2026-12-25", name: "Christmas" },
];

// ---------- Leaves ----------
export const leaves: Leave[] = [
  // Rahul's leaves
  {
    id: "l-1",
    user_id: "u-rahul",
    type: "leave",
    start_date: "2026-05-04",
    end_date: "2026-05-05",
    days_deducted: 2,
    status: "active",
    created_by: "u-rahul",
    reason: "Family function",
    approval_state: "auto",
  },
  {
    id: "l-2",
    user_id: "u-rahul",
    type: "wfh",
    start_date: "2026-05-12",
    end_date: "2026-05-12",
    days_deducted: 1,
    status: "active",
    created_by: "u-rahul",
    approval_state: "auto",
  },
  {
    id: "l-3",
    user_id: "u-rahul",
    type: "leave",
    start_date: "2026-03-09",
    end_date: "2026-03-10",
    days_deducted: 2,
    status: "active",
    created_by: "u-rahul",
    reason: "Personal",
    approval_state: "auto",
  },
  {
    id: "l-4",
    user_id: "u-rahul",
    type: "wfh",
    start_date: "2026-02-04",
    end_date: "2026-02-04",
    days_deducted: 1,
    status: "active",
    created_by: "u-rahul",
    approval_state: "auto",
  },
  {
    id: "l-5",
    user_id: "u-rahul",
    type: "compoff_leave",
    start_date: "2026-04-10",
    end_date: "2026-04-10",
    days_deducted: 1,
    status: "active",
    created_by: "u-rahul",
    reason: "Recovery after launch weekend",
    approval_state: "auto",
  },

  // Ananya — currently on leave today
  {
    id: "l-6",
    user_id: "u-ananya",
    type: "leave",
    start_date: "2026-04-27",
    end_date: "2026-04-29",
    days_deducted: 3,
    status: "active",
    created_by: "u-ananya",
    reason: "Wedding",
    approval_state: "auto",
  },
  // Saanvi — WFH today
  {
    id: "l-7",
    user_id: "u-saanvi",
    type: "wfh",
    start_date: "2026-04-28",
    end_date: "2026-04-28",
    days_deducted: 1,
    status: "active",
    created_by: "u-saanvi",
    approval_state: "auto",
  },
  // Neha — on leave today
  {
    id: "l-8",
    user_id: "u-neha",
    type: "leave",
    start_date: "2026-04-28",
    end_date: "2026-04-28",
    days_deducted: 1,
    status: "active",
    created_by: "u-neha",
    reason: "Doctor",
    approval_state: "auto",
  },
  // Vikram — upcoming
  {
    id: "l-9",
    user_id: "u-vikram",
    type: "leave",
    start_date: "2026-05-06",
    end_date: "2026-05-08",
    days_deducted: 3,
    status: "active",
    created_by: "u-vikram",
    approval_state: "auto",
  },
  // Isha — upcoming WFH stretch
  {
    id: "l-10",
    user_id: "u-isha",
    type: "wfh",
    start_date: "2026-05-04",
    end_date: "2026-05-06",
    days_deducted: 3,
    status: "active",
    created_by: "u-isha",
    approval_state: "auto",
  },
  // Aditya — half day
  {
    id: "l-11",
    user_id: "u-aditya",
    type: "leave",
    start_date: "2026-04-30",
    end_date: "2026-04-30",
    half_day_start: true,
    half_day_position: "second_half",
    days_deducted: 0.5,
    status: "active",
    created_by: "u-aditya",
    approval_state: "auto",
  },
];

// ---------- Leave balances (FY 2026-27) ----------
const LEAVE_YEAR = 2026;

export const leaveBalances: LeaveBalance[] = users.flatMap((u) => [
  { user_id: u.id, leave_year: LEAVE_YEAR, type: "wfh", allocated: 24, used: 0 },
  { user_id: u.id, leave_year: LEAVE_YEAR, type: "leave", allocated: 18, used: 0 },
  { user_id: u.id, leave_year: 0, type: "compoff_wfh", allocated: 1, used: 0 },
  { user_id: u.id, leave_year: 0, type: "compoff_leave", allocated: 2, used: 0 },
]);

// Pre-compute used from leaves
for (const l of leaves) {
  if (l.status !== "active") continue;
  const lyKey = l.type === "compoff_wfh" || l.type === "compoff_leave" ? 0 : LEAVE_YEAR;
  const bal = leaveBalances.find(
    (b) => b.user_id === l.user_id && b.leave_year === lyKey && b.type === l.type
  );
  if (bal) bal.used += l.days_deducted;
}

// Custom adjustments — Rahul is the demo user, give him generous balances
const rahulBal = (type: string) =>
  leaveBalances.find((b) => b.user_id === "u-rahul" && b.type === type);
rahulBal("wfh")!.allocated = 24;
rahulBal("wfh")!.used = 6;
rahulBal("leave")!.allocated = 18;
rahulBal("leave")!.used = 4;
rahulBal("compoff_wfh")!.allocated = 2;
rahulBal("compoff_wfh")!.used = 0;
rahulBal("compoff_leave")!.allocated = 3;
rahulBal("compoff_leave")!.used = 1;

// ---------- Compoff grants ----------
export const compoffGrants: CompoffGrant[] = [
  {
    id: "cg-1",
    user_id: "u-rahul",
    type: "compoff_leave",
    amount: 1,
    work_date: "2026-04-04",
    reason: "Worked Saturday for Q1 review prep",
    status: "approved",
    manager_id: "u-leah",
    decided_at: "2026-04-06T10:14:00Z",
    expires_at: "2026-07-04",
  },
  {
    id: "cg-2",
    user_id: "u-rahul",
    type: "compoff_leave",
    amount: 1,
    work_date: "2026-03-22",
    reason: "Sunday client deck",
    status: "approved",
    manager_id: "u-leah",
    decided_at: "2026-03-23T09:00:00Z",
    expires_at: "2026-06-22",
  },
  {
    id: "cg-3",
    user_id: "u-rahul",
    type: "compoff_wfh",
    amount: 1,
    work_date: "2026-04-19",
    reason: "Released v2 outside hours",
    status: "approved",
    manager_id: "u-leah",
    decided_at: "2026-04-20T11:00:00Z",
    expires_at: "2026-07-19",
  },
  {
    id: "cg-4",
    user_id: "u-rahul",
    type: "compoff_wfh",
    amount: 1,
    work_date: "2026-04-26",
    reason: "Pitch over the weekend",
    status: "pending",
    manager_id: "u-leah",
  },
  {
    id: "cg-5",
    user_id: "u-saanvi",
    type: "compoff_leave",
    amount: 1,
    work_date: "2026-04-25",
    reason: "Production hotfix Saturday",
    status: "pending",
    manager_id: "u-arjun",
  },
  {
    id: "cg-6",
    user_id: "u-vikram",
    type: "compoff_leave",
    amount: 1,
    work_date: "2026-04-26",
    reason: "Migration over Sunday",
    status: "pending",
    manager_id: "u-arjun",
  },
];

// ---------- Notifications ----------
export const notifications: Notification[] = [
  {
    id: "n-1",
    user_id: "u-rahul",
    type: "compoff_approved",
    title: "Comp-off approved",
    body: "Leah approved your comp-off for 4 Apr. Expires 4 Jul.",
    created_at: "2026-04-06T10:14:00Z",
    read_at: undefined,
  },
  {
    id: "n-2",
    user_id: "u-rahul",
    type: "leave_created",
    title: "Ananya is on leave",
    body: "Ananya Verma is on leave Apr 27 – Apr 29.",
    created_at: "2026-04-26T18:30:00Z",
    read_at: undefined,
  },
  {
    id: "n-3",
    user_id: "u-rahul",
    type: "compoff_expiring",
    title: "Comp-off expiring soon",
    body: "1 day of comp-off leave expires on 22 Jun.",
    created_at: "2026-04-25T09:00:00Z",
    read_at: "2026-04-25T11:30:00Z",
  },
];

// ---------- Audit log ----------
export const auditLog: AuditEntry[] = [
  {
    id: "a-1",
    actor_id: "u-stewart",
    action: "balance_changed",
    entity_type: "leave_balance",
    entity_id: "u-rahul",
    diff: { before: { leave_allocated: 16 }, after: { leave_allocated: 18 } },
    note: "Performance bonus 2 days",
    created_at: "2026-04-15T10:00:00Z",
  },
  {
    id: "a-2",
    actor_id: "u-leah",
    action: "compoff_approved",
    entity_type: "compoff_grant",
    entity_id: "cg-1",
    diff: { after: { status: "approved", amount: 1 } },
    created_at: "2026-04-06T10:14:00Z",
  },
  {
    id: "a-3",
    actor_id: "u-stewart",
    action: "leave_backdated",
    entity_type: "leave",
    entity_id: "l-3",
    diff: { after: { start_date: "2026-03-09", end_date: "2026-03-10", type: "leave" } },
    note: "Forgot to log on time, approved verbally",
    created_at: "2026-03-12T15:22:00Z",
  },
  {
    id: "a-4",
    actor_id: "u-arjun",
    action: "compoff_rejected",
    entity_type: "compoff_grant",
    entity_id: "cg-99",
    diff: { after: { status: "rejected" } },
    note: "Already counted as part of regular work",
    created_at: "2026-04-21T09:30:00Z",
  },
];
