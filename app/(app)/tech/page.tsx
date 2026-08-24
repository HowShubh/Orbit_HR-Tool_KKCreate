import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/actions/_helpers'
import {
  getLockupSettings,
  getTechConsoleData,
  listEquipment,
  listKits,
  listPendingApprovals,
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

  const [data, items, users, kits, approvals, slackSettings] = await Promise.all([
    getTechConsoleData(),
    listEquipment(),
    listUsers(),
    listKits(),
    listPendingApprovals(),
    getLockupSettings(),
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
      qrBaseUrl={process.env.LOCKUP_QR_BASE_URL ?? null}
      slackSettings={slackSettings}
      initialTab={searchParams?.tab}
    />
  )
}
