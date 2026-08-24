'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/lib/lockup/cart'

/**
 * The cart bar, pinned across every Lockup route so adding from an item page
 * gives the same feedback as adding from the browse list. It always points at
 * the gear tab with ?cart=1, which is where the cart sheet lives.
 */
export function CartBar() {
  const cart = useCart()
  const pathname = usePathname()
  if (cart.count === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3">
      <Link
        href="/lockup?cart=1"
        scroll={false}
        className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3 text-primary-foreground transition-colors hover:bg-primary/90 lg:max-w-none"
      >
        <span className="flex items-center gap-2.5">
          <ShoppingCart className="h-[18px] w-[18px]" />
          <span className="text-[14.5px] font-bold">
            {cart.count} item{cart.count === 1 ? '' : 's'} in cart
          </span>
        </span>
        <span className="text-[14px] font-bold">
          {pathname === '/lockup' ? 'Review' : 'Review cart'}
        </span>
      </Link>
    </div>
  )
}
