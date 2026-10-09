'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { importEquipmentCsv, type ImportResult, type ImportRow } from '@/lib/actions/lockup'
import { EQUIPMENT_CATEGORIES } from '@/lib/lockup/constants'

type ParsedRow = ImportRow & { __row: number; __error?: string }

const VALID_CATEGORIES = new Set(EQUIPMENT_CATEGORIES.map((c) => c.key as string))

function validateRow(row: ImportRow): string | undefined {
  if (!row.name?.trim()) return 'Missing name'
  if (!VALID_CATEGORIES.has((row.category ?? '').trim().toLowerCase()))
    return `Unknown category "${row.category}"`
  if (!row.location?.trim()) return 'Missing location (L1 or L2)'
  const qty = row.quantity ?? 1
  if (qty < 1 || qty > 99 || !Number.isFinite(qty)) return 'Quantity must be 1 to 99'
  if (qty > 1 && row.serial_number?.trim()) return 'Serial number only works with quantity 1'
  return undefined
}

/** CSV import wizard: parse in the browser, show a full preview with per-row
 *  problems, then create everything in one confirmed step. */
export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function reset() {
    setRows(null)
    setFileName('')
    setResult(null)
  }

  function parseFile(file: File) {
    setFileName(file.name)
    setResult(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (parsed) => {
        const mapped: ParsedRow[] = parsed.data.map((raw, i) => {
          const row: ImportRow = {
            name: (raw.name ?? '').trim(),
            category: (raw.category ?? '').trim().toLowerCase(),
            brand_model: raw.brand_model?.trim() || undefined,
            serial_number: raw.serial_number?.trim() || undefined,
            location: (raw.location ?? '').trim(),
            quantity: raw.quantity?.trim() ? Number(raw.quantity) : 1,
            purchase_date: raw.purchase_date?.trim() || undefined,
            purchase_price_inr: raw.purchase_price_inr?.trim()
              ? Number(raw.purchase_price_inr)
              : undefined,
            notes: raw.notes?.trim() || undefined,
          }
          return { ...row, __row: i + 2, __error: validateRow(row) }
        })
        setRows(mapped)
      },
      error: () => {
        pushToast({ title: 'Could not read that file. Is it a CSV?', variant: 'error' })
      },
    })
  }

  async function submit() {
    if (!rows) return
    const good = rows.filter((r) => !r.__error)
    setBusy(true)
    try {
      const res = await importEquipmentCsv(
        good.map(({ __row, __error, ...row }) => row)
      )
      setResult(res)
      pushToast({
        title: `${res.created} item${res.created === 1 ? '' : 's'} created`,
        body: res.errors.length > 0 ? `${res.errors.length} row(s) had problems.` : 'Now print their QR labels.',
        variant: res.errors.length > 0 ? 'info' : 'success',
      })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Import failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const goodCount = rows?.filter((r) => !r.__error).length ?? 0
  const badCount = (rows?.length ?? 0) - goodCount
  const totalUnits =
    rows?.filter((r) => !r.__error).reduce((sum, r) => sum + (r.quantity ?? 1), 0) ?? 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import inventory CSV</DialogTitle>
          <DialogDescription>
            Template and column guide: docs/equipment/inventory-template.csv in the repo (or ask
            for it). Nothing is saved until you confirm the preview. Quantity above 1 creates
            numbered items, each with its own QR code.
          </DialogDescription>
        </DialogHeader>

        {!rows && (
          <label className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed border-border px-5 py-12 text-center hover:bg-accent/40">
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <span className="text-[14px] font-medium">Choose the CSV file</span>
            <span className="text-[12px] text-muted-foreground">
              name, category, brand_model, serial_number, location, quantity, purchase_date,
              purchase_price_inr, notes
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
            />
          </label>
        )}

        {rows && !result && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-medium">{fileName}</span>
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> {goodCount} row{goodCount === 1 ? '' : 's'} ok
                ({totalUnits} item{totalUnits === 1 ? '' : 's'})
              </span>
              {badCount > 0 && (
                <span className="flex items-center gap-1 text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> {badCount} with problems (skipped)
                </span>
              )}
              <button type="button" className="ml-auto text-[12.5px] text-muted-foreground underline-offset-2 hover:underline" onClick={reset}>
                Pick another file
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border max-h-72 overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Loc</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.__row} className={r.__error ? 'bg-rose-50' : undefined}>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.__row}</td>
                      <td className="px-3 py-1.5 font-medium">{r.name || '(empty)'}</td>
                      <td className="px-3 py-1.5">{r.category}</td>
                      <td className="px-3 py-1.5">{r.location}</td>
                      <td className="px-3 py-1.5">{r.quantity ?? 1}</td>
                      <td className="px-3 py-1.5 text-rose-600">{r.__error ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" disabled={busy || goodCount === 0} onClick={submit}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create {totalUnits} item{totalUnits === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-800">
              {result.created} item{result.created === 1 ? '' : 's'} created. Next: open Labels,
              select the new items and download their QR stickers.
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700 space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i}>
                    Row {e.row}: {e.message}
                  </div>
                ))}
              </div>
            )}
            <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
