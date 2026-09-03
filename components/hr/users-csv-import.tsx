'use client'

import { ChangeEvent, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Download, Plus, Trash2, Upload } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { importUsersCsv } from '@/lib/actions/users-bulk'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { UserWithMembership } from '@/lib/queries/users'
import type { TeamWithMembers } from '@/lib/queries/teams'

type Role = 'employee' | 'team_lead' | 'hr' | 'founder'
type ColumnKey =
  | 'full_name'
  | 'email'
  | 'password'
  | 'role'
  | 'manager_email'
  | 'primary_team_name'
  | 'designation'
  | 'joined_at'
  | 'date_of_birth'

interface EditableRow {
  id: string
  row: number
  full_name: string
  email: string
  password: string
  role: Role | ''
  manager_email: string
  primary_team_name: string
  designation: string
  joined_at: string
  date_of_birth: string
}

interface ValidatedRow extends EditableRow {
  valid: boolean
  errorSummary: string
  errors: Partial<Record<ColumnKey, string>>
}

interface ImportResult {
  imported: number
  credentials: { row: number; email: string; password: string }[]
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  users: UserWithMembership[]
  teams: TeamWithMembers[]
}

const VALID_ROLES: Role[] = ['employee', 'team_lead', 'hr', 'founder']
const HEADER_COLUMNS: ColumnKey[] = [
  'full_name',
  'email',
  'password',
  'role',
  'manager_email',
  'primary_team_name',
  'designation',
  'joined_at',
  'date_of_birth',
]
const LEGACY_COLUMNS: ColumnKey[] = [
  'full_name',
  'email',
  'role',
  'manager_email',
  'primary_team_name',
  'designation',
  'joined_at',
  'date_of_birth',
]
const EMAIL_RE = /^[^@]+@[^@]+\.[^@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

function createEmptyRow(row = 1): EditableRow {
  return {
    id: `${Date.now()}-${Math.random()}`,
    row,
    full_name: '',
    email: '',
    password: '',
    role: 'employee',
    manager_email: '',
    primary_team_name: '',
    designation: '',
    joined_at: '',
    date_of_birth: '',
  }
}

function parseCsvRecords(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n') {
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function parseCsvToRows(text: string): EditableRow[] {
  const records = parseCsvRecords(text)
  if (records.length === 0) return []

  const normalizedFirstRow = records[0].map(normalizeHeader)
  const hasHeader = normalizedFirstRow.some((column) =>
    HEADER_COLUMNS.includes(column as ColumnKey)
  )
  const columns = hasHeader
    ? normalizedFirstRow.map((column) =>
        HEADER_COLUMNS.includes(column as ColumnKey) ? (column as ColumnKey) : null
      )
    : records[0].length >= HEADER_COLUMNS.length
      ? HEADER_COLUMNS
      : LEGACY_COLUMNS

  const dataRows = hasHeader ? records.slice(1) : records
  const rowOffset = hasHeader ? 2 : 1

  return dataRows.map((record, index) => {
    const row = createEmptyRow(index + rowOffset)
    columns.forEach((column, columnIndex) => {
      if (!column) return
      const value = record[columnIndex] ?? ''
      if (column === 'role') {
        row.role = value.trim() as Role | ''
        return
      }
      row[column] = value
    })
    row.role = (row.role || 'employee').trim() as Role
    return row
  })
}

function exportCsv(rows: EditableRow[]) {
  const escapeCell = (value: string) => {
    if (!/[",\n\r]/.test(value)) return value
    return `"${value.replaceAll('"', '""')}"`
  }

  const csv = [
    HEADER_COLUMNS.join(','),
    ...rows.map((row) => HEADER_COLUMNS.map((column) => escapeCell(row[column])).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'users-import-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function validateRows(
  rows: EditableRow[],
  users: UserWithMembership[],
  teams: TeamWithMembers[]
): ValidatedRow[] {
  const existingEmails = new Set(users.map((user) => user.email.toLowerCase()))
  const teamNames = new Set(teams.map((team) => team.name.toLowerCase()))
  const uploadedEmailCounts = new Map<string, number>()

  rows.forEach((row) => {
    const email = row.email.trim().toLowerCase()
    if (!email) return
    uploadedEmailCounts.set(email, (uploadedEmailCounts.get(email) ?? 0) + 1)
  })

  const knownEmails = new Set([
    ...existingEmails,
    ...Array.from(uploadedEmailCounts.keys()),
  ])

  return rows.map((row) => {
    const errors: Partial<Record<ColumnKey, string>> = {}
    const fullName = row.full_name.trim()
    const email = row.email.trim().toLowerCase()
    const managerEmail = row.manager_email.trim().toLowerCase()
    const teamName = row.primary_team_name.trim().toLowerCase()
    const role = row.role.trim()

    if (!fullName) errors.full_name = 'Name is required'
    if (!email || !EMAIL_RE.test(email)) errors.email = 'Valid email is required'
    if (email && existingEmails.has(email)) errors.email = 'User already exists'
    if (email && (uploadedEmailCounts.get(email) ?? 0) > 1) errors.email = 'Duplicate email in CSV'
    if (!VALID_ROLES.includes(role as Role)) errors.role = 'Invalid role'
    if (row.password.trim() && row.password.trim().length < 8) {
      errors.password = 'Password must be 8+ characters'
    }
    if (managerEmail && !EMAIL_RE.test(managerEmail)) {
      errors.manager_email = 'Manager email is invalid'
    } else if (managerEmail && managerEmail === email) {
      errors.manager_email = 'Manager cannot be the same user'
    } else if (managerEmail && !knownEmails.has(managerEmail)) {
      errors.manager_email = 'Manager not found in users or CSV'
    }
    if (teamName && !teamNames.has(teamName)) {
      errors.primary_team_name = 'Team not found'
    }
    if (row.joined_at.trim() && !DATE_RE.test(row.joined_at.trim())) {
      errors.joined_at = 'Use YYYY-MM-DD'
    }
    if (row.date_of_birth.trim() && !DATE_RE.test(row.date_of_birth.trim())) {
      errors.date_of_birth = 'Use YYYY-MM-DD'
    }

    const errorSummary = Object.values(errors).join('; ')
    return {
      ...row,
      email,
      manager_email: managerEmail,
      primary_team_name: row.primary_team_name.trim(),
      valid: errorSummary.length === 0,
      errorSummary,
      errors,
    }
  })
}

export function UsersCsvImport({ open, onOpenChange, users, teams }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<EditableRow[]>([])
  const [csvText, setCsvText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validatedRows = useMemo(
    () => validateRows(rows, users, teams),
    [rows, users, teams]
  )
  const validCount = validatedRows.filter((row) => row.valid).length
  const invalidCount = validatedRows.length - validCount
  const canImport = validatedRows.length > 0 && invalidCount === 0 && !importResult

  function loadRows(nextRows: EditableRow[], nextSourceName = '') {
    setRows(nextRows.map((row, index) => ({ ...row, row: row.row || index + 1 })))
    setSourceName(nextSourceName)
    setImportErrors([])
    setImportResult(null)
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setCsvText(text)
      loadRows(parseCsvToRows(text), file.name)
    }
    reader.onerror = () => {
      pushToast({ title: 'Failed to read file', variant: 'error' })
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function handleLoadText() {
    if (!csvText.trim()) {
      pushToast({ title: 'Paste CSV text first', variant: 'error' })
      return
    }
    loadRows(parseCsvToRows(csvText), 'Pasted CSV')
  }

  function updateRow(id: string, field: ColumnKey, value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    )
    setImportErrors([])
    setImportResult(null)
  }

  function addRow() {
    setRows((current) => [...current, createEmptyRow(current.length + 1)])
    setImportErrors([])
    setImportResult(null)
  }

  function removeRow(id: string) {
    setRows((current) =>
      current
        .filter((row) => row.id !== id)
        .map((row, index) => ({ ...row, row: index + 1 }))
    )
    setImportErrors([])
    setImportResult(null)
  }

  function handleImport() {
    if (validatedRows.length === 0) {
      pushToast({ title: 'Upload or load a CSV first', variant: 'error' })
      return
    }
    if (invalidCount > 0) {
      pushToast({ title: 'Fix CSV errors before importing', variant: 'error' })
      return
    }

    const importRows = validatedRows.map((row) => ({
      __row: String(row.row),
      full_name: row.full_name.trim(),
      email: row.email.trim().toLowerCase(),
      password: row.password.trim(),
      role: row.role,
      manager_email: row.manager_email.trim().toLowerCase(),
      primary_team_name: row.primary_team_name.trim(),
      designation: row.designation.trim(),
      joined_at: row.joined_at.trim(),
      date_of_birth: row.date_of_birth.trim(),
    }))

    startTransition(async () => {
      try {
        const result = await importUsersCsv(importRows)
        setImportResult({
          imported: result.imported,
          credentials: result.credentials ?? [],
        })
        setImportErrors(result.errors)
        router.refresh()
        pushToast({
          title:
            result.errors.length > 0
              ? 'Import blocked'
              : `Imported ${result.imported} user${result.imported !== 1 ? 's' : ''}`,
          body: result.errors.length > 0 ? `${result.errors.length} row(s) need fixes` : undefined,
          variant: result.errors.length > 0 ? 'error' : 'success',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Import failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleClose(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    setRows([])
    setCsvText('')
    setSourceName('')
    setImportErrors([])
    setImportResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Users from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-1.5">
              <Label>CSV file</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Choose CSV
                </Button>
                <Button type="button" variant="ghost" onClick={() => exportCsv([createEmptyRow()])}>
                  <Download className="h-4 w-4" />
                  Template
                </Button>
                {sourceName && (
                  <span className="text-xs text-muted-foreground">{sourceName}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={invalidCount > 0 ? 'danger' : 'success'}>
                {validCount} valid
              </Badge>
              <Badge variant={invalidCount > 0 ? 'danger' : 'muted'}>
                {invalidCount} invalid
              </Badge>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Header: full_name,email,password,role,manager_email,primary_team_name,designation,joined_at,date_of_birth.
            Password, joined_at (defaults to today) and date_of_birth are optional; dates are YYYY-MM-DD.
            manager_email can reference an existing user or any row in this CSV.
          </div>

          <div className="space-y-2">
            <Label>Paste CSV</Label>
            <Textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder={
                'full_name,email,password,role,manager_email,primary_team_name,designation,joined_at,date_of_birth\nAlice Smith,alice@example.com,Welcome123!,employee,bob@example.com,Engineering,Software Engineer,2025-04-01,1996-08-14'
              }
              rows={4}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={handleLoadText}>
              Load Text
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Preview and editor</div>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4" />
                Add Row
              </Button>
            </div>

            {validatedRows.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                Upload or load a CSV to preview users.
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto rounded-lg border">
                <table className="min-w-[1320px] w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Full Name</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Password</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Manager Email</th>
                      <th className="px-3 py-2 font-medium">Team</th>
                      <th className="px-3 py-2 font-medium">Designation</th>
                      <th className="px-3 py-2 font-medium">Joined</th>
                      <th className="px-3 py-2 font-medium">DOB</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedRows.map((row) => (
                      <tr
                        key={row.id}
                        className={cn('border-t align-top', !row.valid && 'bg-rose-50/70')}
                      >
                        <td className="px-3 py-2 text-muted-foreground">{row.row}</td>
                        <EditableCell
                          value={row.full_name}
                          error={row.errors.full_name}
                          onChange={(value) => updateRow(row.id, 'full_name', value)}
                        />
                        <EditableCell
                          value={row.email}
                          error={row.errors.email}
                          onChange={(value) => updateRow(row.id, 'email', value)}
                        />
                        <EditableCell
                          value={row.password}
                          error={row.errors.password}
                          placeholder="Auto"
                          onChange={(value) => updateRow(row.id, 'password', value)}
                        />
                        <td className="px-3 py-2">
                          <Select
                            value={row.role || 'employee'}
                            onValueChange={(value) => updateRow(row.id, 'role', value)}
                          >
                            <SelectTrigger
                              className={cn(
                                'h-8 min-w-[120px] text-xs',
                                row.errors.role && 'border-rose-300 bg-rose-50'
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="employee">Employee</SelectItem>
                              <SelectItem value="team_lead">Team Lead</SelectItem>
                              <SelectItem value="hr">HR</SelectItem>
                              <SelectItem value="founder">Founder</SelectItem>
                            </SelectContent>
                          </Select>
                          {row.errors.role && (
                            <div className="mt-1 text-[10px] text-rose-600">{row.errors.role}</div>
                          )}
                        </td>
                        <EditableCell
                          value={row.manager_email}
                          error={row.errors.manager_email}
                          list="csv-manager-emails"
                          onChange={(value) => updateRow(row.id, 'manager_email', value)}
                        />
                        <EditableCell
                          value={row.primary_team_name}
                          error={row.errors.primary_team_name}
                          list="csv-team-names"
                          onChange={(value) => updateRow(row.id, 'primary_team_name', value)}
                        />
                        <EditableCell
                          value={row.designation}
                          onChange={(value) => updateRow(row.id, 'designation', value)}
                        />
                        <EditableCell
                          value={row.joined_at}
                          error={row.errors.joined_at}
                          placeholder="YYYY-MM-DD"
                          onChange={(value) => updateRow(row.id, 'joined_at', value)}
                        />
                        <EditableCell
                          value={row.date_of_birth}
                          error={row.errors.date_of_birth}
                          placeholder="YYYY-MM-DD"
                          onChange={(value) => updateRow(row.id, 'date_of_birth', value)}
                        />
                        <td className="px-3 py-2">
                          {row.valid ? (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3" />
                              Valid
                            </Badge>
                          ) : (
                            <div className="max-w-[220px] space-y-1">
                              <Badge variant="danger">
                                <AlertTriangle className="h-3 w-3" />
                                Error
                              </Badge>
                              <div className="text-[10px] leading-snug text-rose-700">
                                {row.errorSummary}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-rose-600 hover:text-rose-700"
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <datalist id="csv-manager-emails">
            {users.map((user) => (
              <option key={user.id} value={user.email} />
            ))}
            {validatedRows.map((row) => (
              row.email ? <option key={row.id} value={row.email} /> : null
            ))}
          </datalist>
          <datalist id="csv-team-names">
            {teams.map((team) => (
              <option key={team.id} value={team.name} />
            ))}
          </datalist>

          {importErrors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="text-[12px] font-semibold text-rose-700">Import errors</div>
              {importErrors.map((error, index) => (
                <div key={`${error.row}-${index}`} className="text-xs text-rose-700">
                  Row {error.row}: {error.error}
                </div>
              ))}
            </div>
          )}

          {importResult && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-sm font-semibold text-emerald-700">
                Imported {importResult.imported} user{importResult.imported !== 1 ? 's' : ''}
              </div>
              {importResult.credentials.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-md border border-emerald-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-50 text-left text-emerald-800">
                        <th className="px-3 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.credentials.map((credential) => (
                        <tr key={`${credential.row}-${credential.email}`} className="border-t">
                          <td className="px-3 py-2">{credential.row}</td>
                          <td className="px-3 py-2 font-mono">{credential.email}</td>
                          <td className="px-3 py-2 font-mono">{credential.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Close
          </Button>
          <Button onClick={handleImport} disabled={isPending || !canImport}>
            {isPending ? 'Importing...' : `Import ${validCount} user${validCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditableCell({
  value,
  error,
  placeholder,
  list,
  onChange,
}: {
  value: string
  error?: string
  placeholder?: string
  list?: string
  onChange: (value: string) => void
}) {
  return (
    <td className="px-3 py-2">
      <Input
        value={value}
        list={list}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-8 min-w-[150px] text-xs', error && 'border-rose-300 bg-rose-50')}
      />
      {error && <div className="mt-1 text-[10px] text-rose-600">{error}</div>}
    </td>
  )
}
