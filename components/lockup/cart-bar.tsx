'use client'

import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/lib/lockup/cart'

/**
 * The cart bar, phones only: it sits ABOVE the app's bottom nav rather than
 * across it, and stops at the content column so it never runs under the
 * sidebar. On desktop the cart is a permanent rail beside the gear, so there
 * is no bar at all.
 */
export function CartBar() {
  const cart = useCart()
  if (cart.count === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+3.75rem)] z-20 px-4 lg:hidden">
      <Link
        href="/lockup?cart=1"
        scroll={false}
        className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3 text-primary-foreground shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
      >
        <span className="flex items-center gap-2.5">
          <ShoppingCart className="h-[18px] w-[18px]" />
          <span className="text-[14.5px] font-bold">
            {cart.count} item{cart.count === 1 ? '' : 's'} in cart
          </span>
        </span>
        <span className="text-[14px] font-bold">Review</span>
      </Link>
    </div>
  )
}
