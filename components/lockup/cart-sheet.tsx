'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { EquipmentItemRow, ShootSummary } from '@/lib/queries/lockup'
import { useCart } from '@/lib/lockup/cart'
import { CartPanel } from './cart-panel'

/** Mobile wrapper around the cart panel; desktop shows the panel inline. */
export function CartSheet({
  open,
  onOpenChange,
  items,
  shoots,
  currentUserId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: EquipmentItemRow[]
  shoots: ShootSummary[]
  currentUserId: string
}) {
  const cart = useCart()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your cart</DialogTitle>
          <DialogDescription>
            {cart.count} item{cart.count === 1 ? '' : 's'} picked. Nothing is held until you check
            out.
          </DialogDescription>
        </DialogHeader>
        <CartPanel
          items={items}
          shoots={shoots}
          currentUserId={currentUserId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
