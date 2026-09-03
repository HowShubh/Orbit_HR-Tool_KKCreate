import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/actions/_helpers'
import {
  getConsoleHolds,
  getLockupSettings,
  getOverdueGear,
  getTechConsoleData,
  listEquipment,
  listKits,
  listPendingApprovals,
  listShoots,
} from '@/lib/queries/lockup'
import { listUsers } from '@/lib/queries/users'
import { TechConsoleClient } from '@/components/lockup/tech/tech-console-client'

export default async function TechConsolePage({
  searchParams,
}: {
  searchParams?: { tab?: string }
}) {
  try {
    await requireCapability('manage_equipment')
  } catch {
    redirect('/lockup')
  }

  const [data, items, users, kits, approvals, slackSettings, overdue, holds, shoots] =
    await Promise.all([
      getTechConsoleData(),
      listEquipment(),
      listUsers(),
      listKits(),
      listPendingApprovals(),
      getLockupSettings(),
      getOverdueGear(),
      getConsoleHolds(),
      listShoots(),
    ])
  const people = users
    .filter((u) => u.status === 'active')
    .map((u) => ({ id: u.id, full_name: u.full_name }))

  return (
    <TechConsoleClient
      data={data}
      items={items}
      people={people}
      kits={kits}
      approvals={approvals}
      overdue={overdue}
      holds={holds}
      shoots={shoots}
      qrBaseUrl={process.env.LOCKUP_QR_BASE_URL ?? null}
      slackSettings={slackSettings}
      initialTab={searchParams?.tab}
    />
  )
}
