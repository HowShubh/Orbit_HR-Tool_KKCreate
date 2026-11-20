'use client'

import { createContext, useContext, type ReactNode } from 'react'

// Every user's profile photo, keyed by user id. Loaded once in the (app) layout
// so any <Avatar userId=…> can show the photo without each query selecting it.
const UserPhotosContext = createContext<Record<string, string>>({})

export function UserPhotosProvider({
  photos,
  children,
}: {
  photos: Record<string, string>
  children: ReactNode
}) {
  return <UserPhotosContext.Provider value={photos}>{children}</UserPhotosContext.Provider>
}

export function useUserPhoto(userId: string | null | undefined): string | null {
  const photos = useContext(UserPhotosContext)
  return userId ? photos[userId] ?? null : null
}
