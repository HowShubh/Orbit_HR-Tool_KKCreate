'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, CalendarClock } from 'lucide-react'
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
import { runAnnualReset } from '@/lib/actions/annual-reset'
import { useStore } from '@/lib/store'

interface Props {
  leaveYear: number
}

export function AnnualResetTab({ leaveYear }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [targetYear, setTargetYear] = useState(leaveYear + 1)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleReset() {
    startTransition(async () => {
      try {
        const result = await runAnnualReset(targetYear)
        pushToast({
          title: 'Annual reset complete',
          body: `Reset balances for ${result.resetCount} users in FY ${targetYear}`,
          variant: 'success',
        })
        setConfirmOpen(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reset failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
        setConfirmOpen(false)
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
                Run once per year to create fresh leave and WFH balances for all active users.
                Defaults to 18 days leave and 36 days WFH. Compoff bank is unaffected.
                An error is thrown if the year&apos;s reset has already been run.
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
                  FY {targetYear}
                </div>
                <div className="text-[12.5px] text-muted-foreground mt-1">
                  Will set 18 leave days and 36 WFH days for all active users.
                  You can adjust individual balances afterwards.
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
              Run Annual Reset for FY {targetYear}
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
              This will create leave and WFH balances for <strong>FY {targetYear}</strong> for
              all active users. This action cannot be undone.
            </p>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to proceed?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button disabled={isPending} onClick={handleReset}>
              {isPending ? 'Running…' : `Yes, run reset for FY ${targetYear}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
