import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Box, SearchX } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getItemByCode, listLockupLocations } from '@/lib/queries/lockup'
import { listMyCapabilityKeys } from '@/lib/queries/capabilities'
import { QrActionCard } from '@/components/lockup/qr-action-card'

export const dynamic = 'force-dynamic'

/**
 * QR landing page — the URL printed on every sticker ({base}/e/{code}).
 * Deliberately shell-less and mobile-first: someone standing at the gear
 * shelf sees the item and one big button.
 *
 * Physical-presence rule: in-app links open this page with ?src=app, which
 * requires a real scan of the sticker before taking or returning the item.
 * A direct load (camera scan of the QR) is the scan. Equipment managers
 * (Tech Lead, HR, Founders) are exempt: they can force entry/exit online.
 */
export default async function QrLandingPage({
  params,
  searchParams,
}: {
  params: { code: string }
  searchParams?: { src?: string }
}) {
  const user = await getCurrentUser()
  if (!user || user.status === 'exited') {
    redirect(`/login?next=/e/${encodeURIComponent(params.code)}`)
  }

  const [item, myCapabilities] = await Promise.all([
    getItemByCode(params.code),
    listMyCapabilityKeys(user.id),
  ])
  const canManageEquipment =
    user.role === 'hr' || user.role === 'founder' || myCapabilities.includes('manage_equipment')
  const requireScan = searchParams?.src === 'app' && !canManageEquipment

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg px-4 py-5 space-y-5">
        {/* Lockup mini header */}
        <div className="flex items-center justify-between">
          <Link href="/lockup" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900 grid place-items-center">
              <Box className="h-4 w-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Lockup</span>
          </Link>
          <Link
            href="/lockup"
            className="text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            All gear
          </Link>
        </div>

        {item ? (
          <QrActionCard
            item={item}
            locations={await listLockupLocations()}
            currentUserId={user.id}
            requireScan={requireScan}
          />
        ) : (
          <div className="rounded-xl border border-border bg-card px-5 py-10 text-center space-y-2">
            <SearchX className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="text-[15px] font-semibold">No item with this code</div>
            <p className="text-[13px] text-muted-foreground">
              The sticker may belong to a deleted item, or the code was mistyped. Ask the tech
              lead if this keeps happening.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
