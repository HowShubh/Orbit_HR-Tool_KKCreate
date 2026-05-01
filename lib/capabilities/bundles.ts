export type CapabilityKey =
  | 'view_leaves'
  | 'edit_leaves'
  | 'view_balance'
  | 'edit_balance'
  | 'approve_compoff'
  | 'manage_holidays'
  | 'view_audit_log'
  | 'manage_users'
  | 'manage_capabilities'
  | 'run_annual_reset'

export type Role = 'employee' | 'team_lead' | 'hr' | 'founder'

export const ROLE_BUNDLE_MAP: Partial<Record<Role, string>> = {
  team_lead: 'team_lead',
  hr: 'hr_admin',
  founder: 'founder_full',
}
