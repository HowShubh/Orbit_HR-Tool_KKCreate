import { requireUser } from '@/lib/actions/_helpers'
import { getStudioBlocksRange, listKits, listStudios } from '@/lib/queries/lockup'
import { listUsers } from '@/lib/queries/users'
import { ShootWizard } from '@/components/lockup/wizard/shoot-wizard'

export default async function NewShootPage({
  searchParams,
}: {
  searchParams?: { start?: string }
}) {
  const me = await requireUser()
  const [studios, blocks, kits, users] = await Promise.all([
    listStudios(),
    getStudioBlocksRange(),
    listKits(),
    listUsers(),
  ])

  return (
    <ShootWizard
      studios={studios}
      blocks={blocks}
      kits={kits}
      people={users
        .filter((u) => u.status === 'active' && u.id !== me.id)
        .map((u) => ({ id: u.id, full_name: u.full_name }))}
      startAtStudio={searchParams?.start === 'studio'}
    />
  )
}
