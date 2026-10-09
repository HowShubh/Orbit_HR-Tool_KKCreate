'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'
import { Avatar, type AvatarProps } from '@/components/ui/avatar'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface PhotoUploadProps {
  name: string
  src?: string | null
  size?: AvatarProps['size']
  fallbackText?: string
  /** Server action that receives FormData with a `file` field and returns the new URL. */
  onUpload: (formData: FormData) => Promise<string>
  /** Optional: remove the current photo. */
  onRemove?: () => Promise<void>
}

export function PhotoUpload({
  name,
  src,
  size = 'xl',
  fallbackText,
  onUpload,
  onRemove,
}: PhotoUploadProps) {
  const router = useRouter()
  const { pushToast } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await onUpload(fd)
      pushToast({ title: 'Photo updated', variant: 'success' })
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update photo'
      pushToast({ title: 'Upload failed', body: message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!onRemove) return
    setBusy(true)
    try {
      await onRemove()
      pushToast({ title: 'Photo removed', variant: 'success' })
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove photo'
      pushToast({ title: 'Failed', body: message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div className="relative inline-block">
        <Avatar name={name} src={src} size={size} fallbackText={fallbackText} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Change photo"
          className={cn(
            'absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60'
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {onRemove && src && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-60"
        >
          Remove photo
        </button>
      )}
    </div>
  )
}
