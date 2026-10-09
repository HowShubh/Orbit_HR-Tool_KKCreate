'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Download, Loader2, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import type { EquipmentItemRow } from '@/lib/queries/lockup'
import { CodeChip } from '../item-bits'
import { cn } from '@/lib/utils'

type LabelVariant = 'standard' | 'mini'

const QR_SIZE = 1024

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'item'
}

/** Render one label to a PNG blob: high-res so it stays scannable even when
 *  printed at 15mm for batteries. */
async function renderLabelPng(
  item: { name: string; code: string },
  variant: LabelVariant,
  qrBaseUrl: string
): Promise<Blob> {
  const QRCode = (await import('qrcode')).default
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, `${qrBaseUrl.replace(/\/$/, '')}/e/${item.code}`, {
    width: QR_SIZE,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })

  const footer = variant === 'standard' ? 260 : 120
  const canvas = document.createElement('canvas')
  canvas.width = QR_SIZE
  canvas.height = QR_SIZE + footer
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(qrCanvas, 0, 0)

  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'

  if (variant === 'standard') {
    // Item name (shrink to fit), then the code below it
    let fontSize = 76
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`
    while (ctx.measureText(item.name).width > QR_SIZE - 80 && fontSize > 36) {
      fontSize -= 4
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`
    }
    ctx.fillText(item.name, QR_SIZE / 2, QR_SIZE + 88, QR_SIZE - 60)
    ctx.font = '500 60px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(item.code, QR_SIZE / 2, QR_SIZE + 180)
  } else {
    ctx.font = '600 72px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(item.code, QR_SIZE / 2, QR_SIZE + 84)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png')
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * QR label downloads: single item → direct PNG, multiple → ZIP of PNGs.
 * Blocked until LOCKUP_QR_BASE_URL is configured, so stickers can never be
 * printed with a throwaway URL.
 */
export function LabelDownloadDialog({
  open,
  onOpenChange,
  items,
  qrBaseUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: EquipmentItemRow[]
  qrBaseUrl: string | null
}) {
  const { pushToast } = useStore()
  const [query, setQuery] = useState('')
  const [variant, setVariant] = useState<LabelVariant>('standard')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const active = useMemo(
    () => items.filter((i) => i.status !== 'retired' && i.status !== 'lost'),
    [items]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return active
    return active.filter(
      (i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
    )
  }, [active, query])

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id))

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) filtered.forEach((i) => next.delete(i.id))
      else filtered.forEach((i) => next.add(i.id))
      return next
    })
  }

  async function download() {
    if (!qrBaseUrl) return
    const chosen = active.filter((i) => selected.has(i.id))
    if (chosen.length === 0) return
    setBusy(true)
    try {
      if (chosen.length === 1) {
        const blob = await renderLabelPng(chosen[0], variant, qrBaseUrl)
        triggerDownload(blob, `${sanitizeFileName(chosen[0].name)}__${chosen[0].code}.png`)
      } else {
        const JSZip = (await import('jszip')).default
        const zip = new JSZip()
        for (const item of chosen) {
          const blob = await renderLabelPng(item, variant, qrBaseUrl)
          zip.file(`${sanitizeFileName(item.name)}__${item.code}.png`, blob)
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        triggerDownload(zipBlob, `lockup-labels-${variant}-${chosen.length}.zip`)
      }
      pushToast({
        title:
          chosen.length === 1
            ? 'Label downloaded'
            : `${chosen.length} labels downloaded as ZIP`,
        body: 'Print them on sticker paper (Canva or any tool) and stick them on the gear.',
        variant: 'success',
      })
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Label generation failed',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>QR labels</DialogTitle>
          <DialogDescription>
            High-res PNGs. Standard has the item name (bodies, lights); mini is code-only for
            small stickers on batteries and cards.
          </DialogDescription>
        </DialogHeader>

        {!qrBaseUrl && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Lockup&apos;s permanent QR domain is not set yet (LOCKUP_QR_BASE_URL). Stickers are
              printed once and must never point at a temporary URL, so downloads stay disabled
              until it is configured.
            </span>
          </div>
        )}

        {/* Variant toggle */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: 'standard', title: 'Standard', desc: 'QR + name + code' },
              { key: 'mini', title: 'Mini', desc: 'QR + code only' },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setVariant(v.key)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-colors',
                variant === v.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
              )}
            >
              <div className="text-[13.5px] font-semibold">{v.title}</div>
              <div className="text-[11.5px] text-muted-foreground">{v.desc}</div>
            </button>
          ))}
        </div>

        {/* Selection */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items..."
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={toggleAllFiltered}
          className="text-left text-[12.5px] font-medium text-primary hover:underline"
        >
          {allFilteredSelected ? 'Deselect' : 'Select'} all {filtered.length} shown
        </button>

        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {filtered.map((item) => {
            const isSelected = selected.has(item.id)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(item.id)) next.delete(item.id)
                      else next.add(item.id)
                      return next
                    })
                  }
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-[13px]',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
                  )}
                >
                  <div
                    className={cn(
                      'grid h-4.5 w-4.5 h-5 w-5 shrink-0 place-items-center rounded border',
                      isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                  <CodeChip code={item.code} />
                </button>
              </li>
            )
          })}
        </ul>

        <Button
          type="button"
          className="w-full"
          disabled={!qrBaseUrl || busy || selected.size === 0}
          onClick={download}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {selected.size <= 1
            ? 'Download PNG'
            : `Download ${selected.size} labels (ZIP)`}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
