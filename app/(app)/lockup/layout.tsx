import { CartProvider } from '@/lib/lockup/cart'
import { listLockupLocations } from '@/lib/queries/lockup'
import { LockupBottomActions } from '@/components/lockup/lockup-bottom-actions'

/**
 * The cart lives at the Lockup route level, not on the tabs page, so it
 * survives navigating from browse into an item page and back — and the bar
 * shows wherever you added something from.
 */
export default async function LockupLayout({ children }: { children: React.ReactNode }) {
  const locations = await listLockupLocations()
  return (
    <CartProvider>
      {/* Room for the floating scan button on phones. */}
      <div className="pb-24 lg:pb-0">{children}</div>
      <LockupBottomActions locations={locations} />
    </CartProvider>
  )
}
