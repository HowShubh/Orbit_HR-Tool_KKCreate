'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ScanLine, ShoppingCart } from 'lucide-react'
import { useCart } from '@/lib/lockup/cart'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'
import { ScanStation } from './scan-station'

/**
 * What floats over Lockup on a phone: the scan button, and the cart bar when
 * the cart has anything in it. They live together so they can stack correctly
 * above the app's bottom nav instead of fighting it for the same corner.
 */
export function LockupBottomActions({
  locations,
}: {
  locations: Tables<'equipment_locations'>[]
}) {
  const cart = useCart()
  const [scanOpen, setScanOpen] = useState(false)
  const hasCart = cart.count > 0

  // Bottom nav is ~3.75rem plus the safe area; everything stacks above it.
  const navOffset = 'calc(env(safe-area-inset-bottom, 0px) + 3.75rem)'
  const cartOffset = `calc(${navOffset} + 0.75rem)`
  // With the cart bar showing, the scan button rides above it.
  const scanOffset = hasCart
    ? `calc(${navOffset} + 0.75rem + 3.5rem + 0.75rem)`
    : `calc(${navOffset} + 0.75rem)`

  return (
    <>
      {hasCart && (
        <div
          className="pointer-events-none fixed inset-x-0 z-20 px-4 lg:hidden"
          style={{ bottom: cartOffset }}
        >
          <Link
            href="/lockup?cart=1"
            scroll={false}
            className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3 text-primary-foreground shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
          >
            <span className="flex items-center gap-2.5">
              <ShoppingCart className="h-[18px] w-[18px]" />
              <span className="text-[14.5px] font-bold">
                {cart.count} reserved item{cart.count === 1 ? '' : 's'}
              </span>
            </span>
            <span className="text-[14px] font-bold">Review</span>
          </Link>
        </div>
      )}

      {/* The scan button: phones only, thumb-reachable, always the same corner. */}
      <button
        type="button"
        onClick={() => setScanOpen(true)}
        aria-label="Scan an item to take or return it"
        className={cn(
          'fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 lg:hidden'
        )}
        style={{ bottom: scanOffset }}
      >
        <ScanLine className="h-6 w-6" />
      </button>

      <ScanStation open={scanOpen} onOpenChange={setScanOpen} locations={locations} />
    </>
  )
}
