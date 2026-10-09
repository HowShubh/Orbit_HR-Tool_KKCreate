'use client'

import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { QrScanner } from './qr-scanner'

/**
 * Physical-presence gate: taking gear out or putting it back requires scanning
 * the sticker on the item itself (managers are exempt and never see this).
 * Typing the 6-char code printed under the QR counts too — reading it off the
 * sticker still proves you are holding the item.
 */
export function ScanConfirmDialog({
  open,
  onOpenChange,
  expectCode,
  itemName,
  actionLabel,
  onVerified,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expectCode: string
  itemName: string
  actionLabel: string
  onVerified: () => void
}) {
  const [wrongCode, setWrongCode] = useState<string | null>(null)

  function handleCode(code: string) {
    if (code === expectCode) {
      setWrongCode(null)
      onOpenChange(false)
      onVerified()
    } else {
      setWrongCode(code)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" /> Scan to {actionLabel}
          </DialogTitle>
          <DialogDescription>
            Point your camera at the QR sticker on {itemName}. This confirms the item is
            physically in front of you.
          </DialogDescription>
        </DialogHeader>

        <QrScanner onCode={handleCode} />

        {wrongCode && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
            That sticker belongs to a different item ({wrongCode}). Scan the one on {itemName}.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
