'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { importHolidaysCsv } from '@/lib/actions/holidays'
import { useStore } from '@/lib/store'

interface CsvRow {
  date: string
  name: string
}

interface ParsedRow {
  row: number
  date: string
  name: string
  valid: boolean
  error?: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // Skip header row if it looks like a header
  const firstLine = lines[0].toLowerCase()
  const dataLines = firstLine.includes('date') && firstLine.includes('name')
    ? lines.slice(1)
    : lines

  return dataLines.map((line, i) => {
    const rowNum = i + 1
    // Handle quoted fields minimally
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''))

    if (parts.length < 2) {
      return { row: rowNum, date: '', name: '', valid: false, error: 'Expected date,name columns' }
    }

    const [date, ...nameParts] = parts
    const name = nameParts.join(',').trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { row: rowNum, date, name, valid: false, error: `Invalid date format: "${date}" (expected YYYY-MM-DD)` }
    }
    if (!name) {
      return { row: rowNum, date, name, valid: false, error: 'Name is required' }
    }

    return { row: rowNum, date, name, valid: true }
  })
}

export function HolidayCsvImport({ open, onOpenChange }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<ParsedRow[]>([])
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([])
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null)

  function handlePreview() {
    const rows = parseCsv(csvText)
    setPreview(rows)
    setImportErrors([])
    setImportResult(null)
  }

  function handleImport() {
    const validRows = preview
      .filter((r) => r.valid)
      .map((r): CsvRow => ({ date: r.date, name: r.name }))

    if (validRows.length === 0) {
      pushToast({ title: 'No valid rows to import', variant: 'error' })
      return
    }

    startTransition(async () => {
      try {
        const result = await importHolidaysCsv(validRows)
        setImportResult({ imported: result.imported })
        setImportErrors(result.errors)
        pushToast({
          title: `Imported ${result.imported} holiday${result.imported !== 1 ? 's' : ''}`,
          body: result.errors.length > 0 ? `${result.errors.length} row(s) had errors` : undefined,
          variant: result.errors.length > 0 ? 'info' : 'success',
        })
        if (result.errors.length === 0) {
          onOpenChange(false)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Import failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleClose() {
    setCsvText('')
    setPreview([])
    setImportErrors([])
    setImportResult(null)
    onOpenChange(false)
  }

  const validCount = preview.filter((r) => r.valid).length
  const invalidCount = preview.filter((r) => !r.valid).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Holidays from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Paste CSV (header: date,name)</Label>
            <Textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setPreview([]); setImportResult(null) }}
              placeholder={'date,name\n2026-01-26,Republic Day\n2026-08-15,Independence Day'}
              rows={6}
              className="font-mono text-xs"
            />
          </div>

          <Button type="button" variant="outline" onClick={handlePreview} disabled={!csvText.trim()}>
            Preview
          </Button>

          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] text-muted-foreground">
                {validCount} valid · {invalidCount} invalid
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-muted-foreground bg-muted/40">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.row} className={r.valid ? 'border-t' : 'border-t bg-rose-50'}>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-1.5 font-mono">{r.date || '—'}</td>
                        <td className="px-3 py-1.5">{r.name || '—'}</td>
                        <td className="px-3 py-1.5">
                          {r.valid ? (
                            <span className="text-emerald-600 font-semibold">Valid</span>
                          ) : (
                            <span className="text-rose-600" title={r.error}>Error</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="space-y-1">
              <div className="text-[12px] font-semibold text-destructive">Import errors:</div>
              {importErrors.map((e, i) => (
                <div key={i} className="text-xs text-destructive">
                  Row {e.row}: {e.error}
                </div>
              ))}
            </div>
          )}

          {importResult && (
            <div className="text-sm text-emerald-600 font-semibold">
              Successfully imported {importResult.imported} holidays.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>Close</Button>
          {preview.length > 0 && validCount > 0 && !importResult && (
            <Button onClick={handleImport} disabled={isPending}>
              {isPending ? 'Importing…' : `Import ${validCount} holidays`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
