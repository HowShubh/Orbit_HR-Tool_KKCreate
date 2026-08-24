import { CartProvider } from '@/lib/lockup/cart'
import { CartBar } from '@/components/lockup/cart-bar'

/**
 * The cart lives at the Lockup route level, not on the tabs page, so it
 * survives navigating from browse into an item page and back — and the bar
 * shows wherever you added something from.
 */
export default function LockupLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="pb-24">{children}</div>
      <CartBar />
    </CartProvider>
  )
}
