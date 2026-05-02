'use client'

import { Topbar } from '@/components/layout/topbar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useCapabilities } from '@/hooks/use-capabilities'
import { UsersTab } from './users-tab'
import { TeamsTab } from './teams-tab'
import { HolidaysTab } from './holidays-tab'
import { BalancesTab } from './balances-tab'
import { CompoffTab } from './compoff-tab'
import { AnnualResetTab } from './annual-reset-tab'
import type { UserWithMembership } from '@/lib/queries/users'
import type { TeamWithMembers } from '@/lib/queries/teams'
import type { Tables } from '@/lib/supabase/database.types'

interface Props {
  users: UserWithMembership[]
  teams: TeamWithMembers[]
  holidays: Tables<'holidays'>[]
  balances: Tables<'leave_balances'>[]
  compoffBalances: Tables<'leave_balances'>[]
  grants: Tables<'compoff_grants'>[]
  leaveYear: number
}

export function HRConsoleClient(props: Props) {
  const { can } = useCapabilities()

  if (!can.isHROrAbove) {
    return (
      <>
        <Topbar title="HR Console" />
        <div className="p-12 text-center text-muted-foreground text-sm">
          HR Console is only available to HR and Founders.
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar
        title="HR Console"
        subtitle="Manage people, teams, holidays, leaves, balances and compoff"
      />
      <div className="px-5 lg:px-8 py-5">
        <Tabs defaultValue="users">
          <TabsList className="mb-3">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="holidays">Holidays</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="compoff">Compoff</TabsTrigger>
            <TabsTrigger value="reset">Annual Reset</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersTab users={props.users} teams={props.teams} />
          </TabsContent>
          <TabsContent value="teams">
            <TeamsTab teams={props.teams} users={props.users} />
          </TabsContent>
          <TabsContent value="holidays">
            <HolidaysTab holidays={props.holidays} />
          </TabsContent>
          <TabsContent value="balances">
            <BalancesTab
              users={props.users}
              balances={props.balances}
              compoffBalances={props.compoffBalances}
              leaveYear={props.leaveYear}
            />
          </TabsContent>
          <TabsContent value="compoff">
            <CompoffTab grants={props.grants} users={props.users} />
          </TabsContent>
          <TabsContent value="reset">
            <AnnualResetTab leaveYear={props.leaveYear} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
