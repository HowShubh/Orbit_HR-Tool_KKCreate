'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * The Lockup cart: gear you have picked but not yet taken.
 *
 * Deliberately client-only and localStorage-backed. A cart is a scratchpad, not
 * a claim on the item — nothing is reserved until you check out, so it never
 * needs to hit the server and it survives navigation and reloads. Items are
 * stored by id only; screens resolve them against live data, so a cart entry
 * can never go stale about status or holder.
 */

const STORAGE_KEY = 'lockup.cart.v1'

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    // A corrupt cart is not worth a crash.
    return []
  }
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Private mode / quota: the cart just stops persisting.
  }
}

type CartContextValue = {
  ids: string[]
  has: (itemId: string) => boolean
  add: (itemId: string | string[]) => void
  remove: (itemId: string) => void
  toggle: (itemId: string) => void
  clear: () => void
  count: number
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([])

  // Hydrate after mount: localStorage does not exist during SSR, and reading it
  // in useState's initializer would produce a hydration mismatch.
  useEffect(() => {
    const stored = read()
    if (stored.length > 0) setIds(stored)
  }, [])

  // Every mutation persists as it applies. Deliberately NOT a useEffect on
  // `ids`: such an effect also fires on mount, with the pre-hydration empty
  // state, and wipes the stored cart before hydration lands.
  const apply = useCallback((next: (prev: string[]) => string[]) => {
    setIds((prev) => {
      const value = next(prev)
      write(value)
      return value
    })
  }, [])

  const add = useCallback(
    (itemId: string | string[]) => {
      const incoming = Array.isArray(itemId) ? itemId : [itemId]
      apply((prev) => {
        const out = [...prev]
        for (const id of incoming) if (!out.includes(id)) out.push(id)
        return out
      })
    },
    [apply]
  )

  const remove = useCallback(
    (itemId: string) => apply((prev) => prev.filter((id) => id !== itemId)),
    [apply]
  )

  const toggle = useCallback(
    (itemId: string) =>
      apply((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId])),
    [apply]
  )

  const clear = useCallback(() => apply(() => []), [apply])

  const value = useMemo<CartContextValue>(
    () => ({
      ids,
      has: (itemId: string) => ids.includes(itemId),
      add,
      remove,
      toggle,
      clear,
      count: ids.length,
    }),
    [ids, add, remove, toggle, clear]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
