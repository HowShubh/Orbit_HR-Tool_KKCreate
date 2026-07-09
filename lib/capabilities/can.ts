import type { Role } from './bundles'

export interface CanHelpers {
  viewLeaves(targetUserId: string): boolean
  editLeaves(targetUserId: string): boolean
  viewBalance(targetUserId: string): boolean
  editBalance(targetUserId: string): boolean
  approveCompoff(targetUserId: string): boolean
  manageHolidays(): boolean
  viewAuditLog(): boolean
  manageUsers(): boolean
  manageCapabilities(): boolean
  runAnnualReset(): boolean
  manageEquipment(): boolean
  isHROrAbove: boolean
  hasTeamAccess: boolean
}

export function buildCanFromRole(
  userId: string,
  role: Role,
  ledTeamIds: string[],
  membersByTeam: Record<string, string[]>,
  // Individually granted capability keys (any source). Role checks stay
  // hardcoded above; this only widens access for grants like the Tech Lead's
  // manage_equipment.
  grantedCapabilityKeys: string[] = []
): CanHelpers {
  const isFounder = role === 'founder'
  const isHR = role === 'hr'
  const isTeamLead = role === 'team_lead'

  function inLedTeam(targetUserId: string): boolean {
    return ledTeamIds.some((teamId) =>
      (membersByTeam[teamId] ?? []).includes(targetUserId)
    )
  }

  return {
    viewLeaves: (targetUserId) => {
      if (targetUserId === userId) return true
      if (isFounder || isHR) return true
      if (isTeamLead) return inLedTeam(targetUserId)
      return false
    },
    editLeaves: (_targetUserId) => {
      if (isFounder || isHR) return true
      return false
    },
    viewBalance: (targetUserId) => {
      if (targetUserId === userId) return true
      if (isFounder || isHR) return true
      if (isTeamLead) return inLedTeam(targetUserId)
      return false
    },
    editBalance: () => isFounder || isHR,
    approveCompoff: (targetUserId) => {
      if (isFounder || isHR) return true
      if (isTeamLead) return inLedTeam(targetUserId)
      return false
    },
    manageHolidays: () => isFounder || isHR,
    viewAuditLog: () => isFounder || isHR,
    manageUsers: () => isFounder || isHR,
    manageCapabilities: () => isFounder,
    runAnnualReset: () => isFounder || isHR,
    manageEquipment: () =>
      isFounder || isHR || grantedCapabilityKeys.includes('manage_equipment'),
    isHROrAbove: isFounder || isHR,
    hasTeamAccess: isFounder || isHR || isTeamLead,
  }
}
