'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { runAnnualReset, deleteFiscalYearData } from '@/lib/actions/annual-reset'
import { useStore } from '@/lib/store'
import { formatFiscalYear, currentFiscalYearStart } from '@/lib/date'

interface Props {
  leaveYear: number
  availableYears: number[]
}

export function AnnualResetTab({ leaveYear, availableYears }: Props) {
  const { pushToast } = useStore()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [targetYear, setTargetYear] = useState(leaveYear + 1)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Years that can be deleted in the danger zone: any year with data except the
  // current (live) fiscal year.
  const deletableYears = availableYears.filter((y) => y !== currentFiscalYearStart())
  const [deleteYear, setDeleteYear] = useState<number | null>(deletableYears[0] ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleReset() {
    startTransition(async () => {
      try {
        const result = await runAnnualReset(targetYear)
        pushToast({
          title: 'Annual reset complete',
          body: `Reset balances for ${result.resetCount} users in FY ${formatFiscalYear(targetYear)}`,
          variant: 'success',
        })
        setConfirmOpen(false)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reset failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
        setConfirmOpen(false)
      }
    })
  }

  function handleDeleteYear() {
    if (deleteYear === null) return
    startTransition(async () => {
      try {
        const result = await deleteFiscalYearData(deleteYear)
        pushToast({
          title: 'Fiscal year deleted',
          body: `Removed ${result.deleted} balance rows for FY ${formatFiscalYear(deleteYear)}.`,
          variant: 'success',
        })
        setConfirmDelete(false)
        setDeleteYear(null)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Delete failed'
        pushToast({ title: "Can't delete", body: msg, variant: 'error' })
        setConfirmDelete(false)
      }
    })
  }

  return (
    <>
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-[14px] font-semibold text-amber-900">
                Annual reset window
              </div>
              <div className="text-[12.5px] text-amber-900/80">
                Run once per year to create fresh leave and WFH balances for all active users,
                using each type&apos;s configured annual quota (set in Leave Types). Compoff bank
                is unaffected. An error is thrown if the year&apos;s reset has already been run.
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Target Year
                </div>
                <div className="text-[20px] font-semibold tracking-tight">
                  FY {formatFiscalYear(targetYear)}
                </div>
                <div className="text-[12.5px] text-muted-foreground mt-1">
                  Creates fresh balances from each type&apos;s configured quota for all active
                  users. You can adjust individual balances afterwards.
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="year-input" className="text-[12px]">Leave Year</Label>
                <Input
                  id="year-input"
                  type="number"
                  className="w-28"
                  value={targetYear}
                  onChange={(e) => setTargetYear(Number(e.target.value))}
                  min={leaveYear}
                  max={leaveYear + 5}
                />
              </div>
            </div>

            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={isPending || !targetYear}
            >
              <CalendarClock className="h-4 w-4" />
              Run Annual Reset for FY {formatFiscalYear(targetYear)}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Annual Reset</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This will create leave and WFH balances for <strong>FY {formatFiscalYear(targetYear)}</strong> for
              all active users. This action cannot be undone.
            </p>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to proceed?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button disabled={isPending} onClick={handleReset}>
              {isPending ? 'Running…' : `Yes, run reset for FY ${formatFiscalYear(targetYear)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Danger zone: delete a fiscal year's balances (undo an accidental reset). */}
      <Card className="border-rose-200">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-rose-700">
            <Trash2 className="h-4 w-4" />
            <div className="text-[14px] font-semibold">Danger zone</div>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Delete all leave/WFH balances and the reset record for a fiscal year — use this to
            undo an accidental reset. The <strong>current</strong> fiscal year can&rsquo;t be deleted,
            and comp-off banks are never touched. This cannot be undone.
          </p>

          {deletableYears.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No other fiscal years to delete.
            </p>
          ) : !confirmDelete ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="delete-year" className="text-[12px]">Fiscal year</Label>
                <select
                  id="delete-year"
                  className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                  value={deleteYear ?? ''}
                  onChange={(e) => setDeleteYear(Number(e.target.value))}
                >
                  {deletableYears.map((y) => (
                    <option key={y} value={y}>{formatFiscalYear(y)}</option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                disabled={isPending || deleteYear === null}
                onClick={() => setConfirmDelete(true)}
                className="text-rose-700 hover:bg-rose-50 hover:border-rose-300"
              >
                <Trash2 className="h-4 w-4" />
                Delete FY {deleteYear !== null ? formatFiscalYear(deleteYear) : ''} data
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-900">
              <span>
                Permanently delete all balances for{' '}
                <strong>FY {deleteYear !== null ? formatFiscalYear(deleteYear) : ''}</strong>?
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={handleDeleteYear}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  {isPending ? 'Deleting…' : 'Yes, delete'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
