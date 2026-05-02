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
import { importUsersCsv } from '@/lib/actions/users-bulk'
import { useStore } from '@/lib/store'

type Role = 'employee' | 'team_lead' | 'hr' | 'founder'

interface ParsedRow {
  row: number
  full_name: string
  email: string
  role: string
  manager_email: string
  primary_team_name: string
  designation: string
  valid: boolean
  error?: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

const VALID_ROLES: Role[] = ['employee', 'team_lead', 'hr', 'founder']

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // Skip header row if present
  const firstLine = lines[0].toLowerCase()
  const dataLines =
    firstLine.includes('full_name') || firstLine.includes('email')
      ? lines.slice(1)
      : lines

  return dataLines.map((line, i) => {
    const rowNum = i + 1
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''))

    const [
      full_name = '',
      email = '',
      role = '',
      manager_email = '',
      primary_team_name = '',
      designation = '',
    ] = parts

    if (!full_name) {
      return { row: rowNum, full_name, email, role, manager_email, primary_team_name, designation, valid: false, error: 'full_name is required' }
    }
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return { row: rowNum, full_name, email, role, manager_email, primary_team_name, designation, valid: false, error: `Invalid email: "${email}"` }
    }
    if (!VALID_ROLES.includes(role as Role)) {
      return { row: rowNum, full_name, email, role, manager_email, primary_team_name, designation, valid: false, error: `Invalid role: "${role}" (must be employee|team_lead|hr|founder)` }
    }

    return { row: rowNum, full_name, email, role, manager_email, primary_team_name, designation, valid: true }
  })
}

export function UsersCsvImport({ open, onOpenChange }: Props) {
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
      .map((r) => ({
        full_name: r.full_name,
        email: r.email,
        role: r.role,
        manager_email: r.manager_email,
        primary_team_name: r.primary_team_name,
        designation: r.designation,
      }))

    if (validRows.length === 0) {
      pushToast({ title: 'No valid rows to import', variant: 'error' })
      return
    }

    startTransition(async () => {
      try {
        const result = await importUsersCsv(validRows)
        setImportResult({ imported: result.imported })
        setImportErrors(result.errors)
        pushToast({
          title: `Imported ${result.imported} user${result.imported !== 1 ? 's' : ''}`,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Users from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground font-mono">
            Header: full_name,email,role,manager_email,primary_team_name,designation
            <br />
            Roles: employee | team_lead | hr | founder
            <br />
            Note: manager_email must reference a user already in the system or earlier in this CSV.
          </div>

          <div className="space-y-1.5">
            <Label>Paste CSV</Label>
            <Textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value)
                setPreview([])
                setImportResult(null)
              }}
              placeholder={'full_name,email,role,manager_email,primary_team_name,designation\nAlice Smith,alice@example.com,employee,bob@example.com,Engineering,Software Engineer'}
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
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Manager</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.row} className={r.valid ? 'border-t' : 'border-t bg-rose-50'}>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-1.5 font-medium">{r.full_name || '—'}</td>
                        <td className="px-3 py-1.5 font-mono">{r.email || '—'}</td>
                        <td className="px-3 py-1.5">{r.role || '—'}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.manager_email || '—'}</td>
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
              Successfully imported {importResult.imported} user{importResult.imported !== 1 ? 's' : ''}.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>Close</Button>
          {preview.length > 0 && validCount > 0 && !importResult && (
            <Button onClick={handleImport} disabled={isPending}>
              {isPending ? 'Importing…' : `Import ${validCount} user${validCount !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
