'use client'

import { ChangeEvent, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Download, Upload } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { importCompoffGrantsCsv } from '@/lib/actions/compoff'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { UserWithMembership } from '@/lib/queries/users'

const COLUMNS = ['email', 'type', 'work_date', 'half_day', 'reason'] as const
type Col = (typeof COLUMNS)[number]

interface Row {
  row: number
  email: string
  type: string
  work_date: string
  half_day: string
  reason: string
}
interface Validated extends Row {
  valid: boolean
  errorSummary: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  users: UserWithMembership[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HALF_OK = ['', 'true', 'yes', 'y', 'half', '0.5', 'false', 'no', 'n', '0', 'full']

function normalizeType(raw: string): 'compoff_leave' | 'compoff_wfh' | null {
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['compoff_leave', 'comp_off_leave', 'comp_leave', 'leave'].includes(t)) return 'compoff_leave'
  if (['compoff_wfh', 'comp_off_wfh', 'comp_wfh', 'wfh'].includes(t)) return 'compoff_wfh'
  return null
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (char === '"' && next === '"') { cell += '"'; i++ }
      else if (char === '"') inQuotes = false
      else cell += char
      continue
    }
    if (char === '"') inQuotes = true
    else if (char === ',') { row.push(cell.trim()); cell = '' }
    else if (char === '\n') { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '' }
    else if (char !== '\r') cell += char
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function parseCsv(text: string): Row[] {
  const records = parseCsvRecords(text)
  if (records.length === 0) return []
  const header = records[0].map((c) => c.trim().toLowerCase().replace(/\s+/g, '_'))
  const hasHeader = COLUMNS.some((c) => header.includes(c))
  const cols = hasHeader
    ? header.map((c) => (COLUMNS.includes(c as Col) ? (c as Col) : null))
    : COLUMNS.slice()
  const dataRows = hasHeader ? records.slice(1) : records
  const offset = hasHeader ? 2 : 1
  return dataRows.map((rec, i) => {
    const r: Row = { row: i + offset, email: '', type: '', work_date: '', half_day: '', reason: '' }
    cols.forEach((col, idx) => {
      if (!col) return
      r[col] = rec[idx] ?? ''
    })
    return r
  })
}

export function CompoffCsvImport({ open, onOpenChange, users }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>([])
  const [csvText, setCsvText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([])
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const emailSet = useMemo(
    () => new Set(users.filter((u) => u.status === 'active').map((u) => u.email.toLowerCase())),
    [users]
  )

  const validated: Validated[] = useMemo(() => {
    const seen = new Set<string>()
    return rows.map((r) => {
      const errs: string[] = []
      const email = r.email.trim().toLowerCase()
      if (!email) errs.push('email required')
      else if (!emailSet.has(email)) errs.push('email not an active user')
      if (!r.type.trim()) errs.push('type required')
      else if (!normalizeType(r.type)) errs.push(`unknown type "${r.type}" (compoff_leave / compoff_wfh)`)
      if (!DATE_RE.test(r.work_date.trim())) errs.push('work_date must be YYYY-MM-DD')
      if (!HALF_OK.includes(r.half_day.trim().toLowerCase())) errs.push('half_day: blank / yes / no')
      if (!r.reason.trim()) errs.push('reason required')
      if (email && DATE_RE.test(r.work_date.trim())) {
        const key = `${email}|${r.work_date.trim()}`
        if (seen.has(key)) errs.push('duplicate work_date for this person in CSV')
        else seen.add(key)
      }
      return { ...r, valid: errs.length === 0, errorSummary: errs.join('; ') }
    })
  }, [rows, emailSet])

  const validCount = validated.filter((r) => r.valid).length
  const invalidCount = validated.length - validCount
  const canImport = validated.length > 0 && invalidCount === 0 && importedCount === null

  function load(text: string, name: string) {
    setRows(parseCsv(text))
    setSourceName(name)
    setImportErrors([])
    setImportedCount(null)
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { const t = String(reader.result ?? ''); setCsvText(t); load(t, file.name) }
    reader.onerror = () => pushToast({ title: 'Failed to read file', variant: 'error' })
    reader.readAsText(file)
    e.target.value = ''
  }

  function downloadTemplate() {
    const csv =
      'email,type,work_date,half_day,reason\n' +
      'employee@kkcreate.in,compoff_leave,2026-05-25,,Worked on Sunday launch\n' +
      'employee@kkcreate.in,compoff_wfh,2026-05-18,yes,Half day on a holiday\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'compoff-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport() {
    if (!canImport) return
    const payload = validated.map((r) => ({
      __row: String(r.row),
      email: r.email.trim().toLowerCase(),
      type: r.type.trim(),
      work_date: r.work_date.trim(),
      half_day: r.half_day.trim(),
      reason: r.reason.trim(),
    }))
    startTransition(async () => {
      try {
        const result = await importCompoffGrantsCsv(payload)
        setImportErrors(result.errors)
        setImportedCount(result.imported)
        router.refresh()
        pushToast({
          title: result.errors.length > 0 ? 'Import blocked' : `Granted ${result.imported} comp-off entr${result.imported === 1 ? 'y' : 'ies'}`,
          body: result.errors.length > 0 ? `${result.errors.length} row(s) need fixes` : undefined,
          variant: result.errors.length > 0 ? 'error' : 'success',
        })
      } catch (err) {
        pushToast({ title: 'Error', body: err instanceof Error ? err.message : 'Import failed', variant: 'error' })
      }
    })
  }

  function close() {
    setRows([]); setCsvText(''); setSourceName(''); setImportErrors([]); setImportedCount(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk-grant comp-off from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose CSV
            </Button>
            <Button type="button" variant="ghost" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Template
            </Button>
            {sourceName && <span className="text-xs text-muted-foreground">{sourceName}</span>}
            <div className="ml-auto flex items-center gap-2 text-xs">
              <Badge variant={invalidCount > 0 ? 'danger' : 'success'}>{validCount} valid</Badge>
              <Badge variant={invalidCount > 0 ? 'danger' : 'muted'}>{invalidCount} invalid</Badge>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Header: <code>email,type,work_date,half_day,reason</code>. <code>work_date</code> is the day
            worked (YYYY-MM-DD, not in the future). <code>type</code> is <code>compoff_leave</code> or
            <code> compoff_wfh</code>. <code>half_day</code> is optional (yes = 0.5 day); <code>reason</code> is
            required. Grants are credited to the balance immediately and the employee + manager are notified.
          </div>

          <div className="space-y-2">
            <Label>Paste CSV</Label>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'email,type,work_date,half_day,reason\nrahul@kkcreate.in,compoff_leave,2026-05-25,,Worked on Sunday'}
              rows={4}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={() => load(csvText, 'Pasted CSV')}>Load Text</Button>
          </div>

          {validated.length > 0 && (
            <div className="max-h-[360px] overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Work date</th>
                    <th className="px-3 py-2 font-medium">Half</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.map((r) => (
                    <tr key={r.row} className={cn('border-t align-top', !r.valid && 'bg-rose-50/70')}>
                      <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                      <td className="px-3 py-2">{r.email || '—'}</td>
                      <td className="px-3 py-2">{r.type || '—'}</td>
                      <td className="px-3 py-2 font-mono">{r.work_date || '—'}</td>
                      <td className="px-3 py-2">{r.half_day || '—'}</td>
                      <td className="px-3 py-2">
                        {r.valid ? (
                          <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Valid</Badge>
                        ) : (
                          <div className="max-w-[260px] space-y-1">
                            <Badge variant="danger"><AlertTriangle className="h-3 w-3" /> Error</Badge>
                            <div className="text-[10px] leading-snug text-rose-700">{r.errorSummary}</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="text-[12px] font-semibold text-rose-700">Import errors (nothing was imported)</div>
              {importErrors.map((e, i) => (
                <div key={`${e.row}-${i}`} className="text-xs text-rose-700">Row {e.row}: {e.error}</div>
              ))}
            </div>
          )}

          {importedCount !== null && importErrors.length === 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              Granted {importedCount} comp-off entr{importedCount !== 1 ? 'ies' : 'y'} to balances.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>Close</Button>
          <Button onClick={handleImport} disabled={isPending || !canImport}>
            {isPending ? 'Granting…' : `Grant ${validCount} comp-off`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
