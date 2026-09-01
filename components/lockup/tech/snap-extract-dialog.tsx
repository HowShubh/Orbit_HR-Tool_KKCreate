'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImagePlus, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import {
  extractEquipmentFromPhotos,
  importEquipmentCsv,
  type ImportResult,
  type ImportRow,
} from '@/lib/actions/lockup'
import { AI_EXTRACT_MODELS, EQUIPMENT_CATEGORIES } from '@/lib/lockup/constants'
import type { Tables } from '@/lib/supabase/database.types'

type ReviewRow = {
  __id: string
  name: string
  category: string
  brand_model: string
  serial_number: string
  quantity: number
  location: string
  notes: string
}

const VALID_CATEGORIES = new Set(EQUIPMENT_CATEGORIES.map((c) => c.key as string))

function rowError(r: ReviewRow): string | undefined {
  if (!r.name.trim()) return 'Name?'
  if (!VALID_CATEGORIES.has(r.category)) return 'Category?'
  if (!r.location.trim()) return 'Location?'
  if (r.quantity < 1 || r.quantity > 99) return 'Qty 1-99'
  if (r.quantity > 1 && r.serial_number.trim()) return 'Serial needs qty 1'
  return undefined
}

let seq = 0
const nextId = () => `r${seq++}`

/** Shrink a photo before it travels: capped long edge, JPEG. Keeps the AI
 *  payload (and cost) sane without the tech lead thinking about file sizes. */
async function fileToDataUrl(file: File, maxDim = 1600, quality = 0.8): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('read failed'))
    fr.readAsDataURL(file)
  })
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('decode failed'))
      im.src = dataUrl
    })
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    if (scale >= 1) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl
  }
}

/**
 * Snap & extract: photograph the gear, let a vision model read it into a draft
 * list, then the tech lead corrects anything wrong right here and confirms.
 * The confirm step reuses the same importEquipmentCsv path as the CSV importer.
 */
export function SnapExtractDialog({
  open,
  onOpenChange,
  locations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: Tables<'equipment_locations'>[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
  const [images, setImages] = useState<string[]>([])
  const [model, setModel] = useState<string>(AI_EXTRACT_MODELS[0].id)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setStep('upload')
      setImages([])
      setRows([])
      setResult(null)
      setBusy(false)
    }
  }

  async function addFiles(files: FileList) {
    const room = 8 - images.length
    if (room <= 0) {
      pushToast({ title: 'Up to 8 photos', variant: 'info' })
      return
    }
    const chosen = Array.from(files).slice(0, room)
    const urls = await Promise.all(chosen.map((f) => fileToDataUrl(f)))
    setImages((prev) => [...prev, ...urls])
  }

  async function extract() {
    setBusy(true)
    try {
      const drafts = await extractEquipmentFromPhotos({ images, model })
      const onlyLocation = locations.length === 1 ? locations[0].label : ''
      setRows(
        drafts.map((d) => ({
          __id: nextId(),
          name: d.name,
          category: d.category,
          brand_model: d.brand_model ?? '',
          serial_number: d.serial_number ?? '',
          quantity: d.quantity ?? 1,
          location: onlyLocation,
          notes: d.notes ?? '',
        }))
      )
      setStep('review')
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Extraction failed',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  function patch(id: string, next: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.__id === id ? { ...r, ...next } : r)))
  }
  function addBlank() {
    setRows((prev) => [
      ...prev,
      {
        __id: nextId(),
        name: '',
        category: 'other',
        brand_model: '',
        serial_number: '',
        quantity: 1,
        location: locations.length === 1 ? locations[0].label : '',
        notes: '',
      },
    ])
  }

  async function create() {
    const good = rows.filter((r) => !rowError(r))
    if (good.length === 0) return
    setBusy(true)
    try {
      const payload: ImportRow[] = good.map((r) => ({
        name: r.name.trim(),
        category: r.category,
        brand_model: r.brand_model.trim() || undefined,
        serial_number: r.serial_number.trim() || undefined,
        location: r.location.trim(),
        quantity: r.quantity,
        notes: r.notes.trim() || undefined,
      }))
      const res = await importEquipmentCsv(payload)
      setResult(res)
      setStep('done')
      pushToast({
        title: `${res.created} item${res.created === 1 ? '' : 's'} created`,
        body: res.errors.length > 0 ? `${res.errors.length} had problems.` : 'Now print their QR labels.',
        variant: res.errors.length > 0 ? 'info' : 'success',
      })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Could not create', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const goodCount = rows.filter((r) => !rowError(r)).length
  const totalUnits = rows.filter((r) => !rowError(r)).reduce((n, r) => n + (r.quantity || 1), 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Snap &amp; extract
          </DialogTitle>
          <DialogDescription>
            {step === 'upload'
              ? 'Photograph the gear, and the model reads it into a list you can fix before saving.'
              : step === 'review'
                ? 'Check every row. Edit anything that is off, set a location, then create them all.'
                : 'Done.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((src, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {images.length < 8 && (
                <label className="grid aspect-square cursor-pointer place-items-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:bg-accent/40">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-[11px]">Add photos</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) void addFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>

            {/* Phone camera shortcut */}
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-[13px] font-medium hover:bg-accent sm:hidden">
              <Camera className="h-4 w-4" /> Take a photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>

            <div className="space-y-1.5">
              <label htmlFor="ai-model" className="text-[12.5px] font-medium">
                Model
              </label>
              <select
                id="ai-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-[13.5px]"
              >
                {AI_EXTRACT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-[11.5px] text-muted-foreground">
                Runs through OpenRouter. Needs OPENROUTER_API_KEY set, otherwise this stays off.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={busy || images.length === 0} onClick={extract}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Extract {images.length > 0 ? `${images.length} photo${images.length === 1 ? '' : 's'}` : ''}
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">Brand / model</th>
                    <th className="px-2 py-2 font-medium">Serial</th>
                    <th className="px-2 py-2 font-medium">Qty</th>
                    <th className="px-2 py-2 font-medium">Location</th>
                    <th className="px-2 py-2 font-medium">Notes</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const err = rowError(r)
                    return (
                      <tr key={r.__id} className={err ? 'bg-rose-50/60' : undefined}>
                        <td className="px-1.5 py-1">
                          <input
                            value={r.name}
                            onChange={(e) => patch(r.__id, { name: e.target.value })}
                            className="w-36 rounded-md border border-input bg-card px-2 py-1"
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <select
                            value={r.category}
                            onChange={(e) => patch(r.__id, { category: e.target.value })}
                            className="w-28 rounded-md border border-input bg-card px-1.5 py-1"
                          >
                            {EQUIPMENT_CATEGORIES.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            value={r.brand_model}
                            onChange={(e) => patch(r.__id, { brand_model: e.target.value })}
                            className="w-32 rounded-md border border-input bg-card px-2 py-1"
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            value={r.serial_number}
                            onChange={(e) => patch(r.__id, { serial_number: e.target.value })}
                            className="w-24 rounded-md border border-input bg-card px-2 py-1"
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={r.quantity}
                            onChange={(e) => patch(r.__id, { quantity: Number(e.target.value) })}
                            className="w-14 rounded-md border border-input bg-card px-2 py-1"
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <select
                            value={r.location}
                            onChange={(e) => patch(r.__id, { location: e.target.value })}
                            className="w-28 rounded-md border border-input bg-card px-1.5 py-1"
                          >
                            <option value="">Pick…</option>
                            {locations.map((l) => (
                              <option key={l.id} value={l.label}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            value={r.notes}
                            onChange={(e) => patch(r.__id, { notes: e.target.value })}
                            className="w-40 rounded-md border border-input bg-card px-2 py-1"
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <button
                            type="button"
                            aria-label="Remove row"
                            onClick={() => setRows((p) => p.filter((x) => x.__id !== r.__id))}
                            className="text-muted-foreground hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={addBlank}>
                <Plus className="h-4 w-4" /> Add a row
              </Button>
              <span className="text-[12px] text-muted-foreground">
                {goodCount} of {rows.length} ready · {totalUnits} item{totalUnits === 1 ? '' : 's'} to
                create
              </span>
              <button
                type="button"
                className="ml-auto text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setStep('upload')}
              >
                Back to photos
              </button>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={busy || goodCount === 0} onClick={create}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create {totalUnits} item{totalUnits === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-800">
              {result.created} item{result.created === 1 ? '' : 's'} created. Next: open the
              inventory and download their QR labels.
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">
                {result.errors.map((e, i) => (
                  <div key={i}>
                    Row {e.row}: {e.message}
                  </div>
                ))}
              </div>
            )}
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
