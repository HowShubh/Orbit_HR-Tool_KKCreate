'use client'

import { useEffect, useTransition, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createTeam, updateTeam } from '@/lib/actions/teams'
import { updateTeamPhoto } from '@/lib/actions/avatars'
import { PhotoUpload } from '@/components/ui/photo-upload'
import { useStore } from '@/lib/store'
import { cn, teamInitials } from '@/lib/utils'
import type { TeamWithMembers } from '@/lib/queries/teams'
import type { UserWithMembership } from '@/lib/queries/users'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
type Day = (typeof DAYS)[number]

type DayState = 'office' | 'wfh' | 'off'
const DAY_STATES: { value: DayState; label: string; active: string }[] = [
  { value: 'office', label: 'Office', active: 'bg-primary text-primary-foreground border-primary' },
  { value: 'wfh', label: 'WFH', active: 'bg-blue-500 text-white border-blue-500' },
  { value: 'off', label: 'Off', active: 'bg-slate-400 text-white border-slate-400' },
]

const DEFAULT_SCHEDULE: Record<Day, DayState> = {
  MON: 'office', TUE: 'office', WED: 'office', THU: 'office', FRI: 'office',
  SAT: 'wfh', SUN: 'off',
}

function scheduleFromTeam(wfo?: string | null, off?: string | null): Record<Day, DayState> {
  const officeSet = new Set((wfo ?? '').split(',').map((d) => d.trim().toUpperCase()))
  const offSet = new Set((off ?? '').split(',').map((d) => d.trim().toUpperCase()))
  return DAYS.reduce((acc, day) => {
    acc[day] = officeSet.has(day) ? 'office' : offSet.has(day) ? 'off' : 'wfh'
    return acc
  }, {} as Record<Day, DayState>)
}

const Schema = z.object({
  name: z.string().min(1, 'Name required'),
  team_lead_id: z.string().optional(),
})

type FormValues = z.infer<typeof Schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  team?: TeamWithMembers
  users: UserWithMembership[]
}

export function TeamFormDialog({ open, onOpenChange, mode, team, users }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [schedule, setSchedule] = useState<Record<Day, DayState>>(DEFAULT_SCHEDULE)

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: '',
      team_lead_id: '',
    },
  })

  useEffect(() => {
    if (mode === 'edit' && team) {
      reset({
        name: team.name,
        team_lead_id: team.team_lead_id ?? '',
      })
      setSchedule(scheduleFromTeam(team.wfo_pattern, team.off_days))
    } else {
      reset({ name: '', team_lead_id: '' })
      setSchedule(DEFAULT_SCHEDULE)
    }
  }, [open, team, mode, reset])

  function setDayState(day: Day, state: DayState) {
    setSchedule((prev) => ({ ...prev, [day]: state }))
  }

  function onSubmit(data: FormValues) {
    const wfo_pattern = DAYS.filter((d) => schedule[d] === 'office').join(',')
    const off_days = DAYS.filter((d) => schedule[d] === 'off').join(',')

    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createTeam({
            name: data.name,
            wfo_pattern,
            off_days,
            team_lead_id: data.team_lead_id || null,
          })
          pushToast({ title: 'Team created', variant: 'success' })
        } else if (team) {
          await updateTeam({
            id: team.id,
            name: data.name,
            wfo_pattern,
            off_days,
            team_lead_id: data.team_lead_id || null,
          })
          pushToast({ title: 'Team updated', variant: 'success' })
        }
        onOpenChange(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Team' : 'Edit Team'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {mode === 'edit' && team && (
            <div className="flex flex-col items-center gap-2">
              <PhotoUpload
                name={team.name}
                src={team.photo_url}
                size="xl"
                fallbackText={teamInitials(team.name)}
                onUpload={(fd) => updateTeamPhoto(team.id, fd)}
              />
              <p className="text-[11px] text-muted-foreground">Team photo</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="name">Team Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Weekly schedule</Label>
            <p className="text-xs text-muted-foreground">
              Set each day to Office, work-from-home, or a weekly off. Off days can&apos;t have leave or WFH applied.
            </p>
            <div className="space-y-1">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center justify-between gap-2">
                  <span className="w-9 text-xs font-semibold text-muted-foreground">{day}</span>
                  <div className="flex gap-1">
                    {DAY_STATES.map((state) => (
                      <button
                        key={state.value}
                        type="button"
                        onClick={() => setDayState(day, state.value)}
                        className={cn(
                          'rounded-md border px-3 py-1 text-xs font-semibold transition-colors',
                          schedule[day] === state.value
                            ? state.active
                            : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                        )}
                      >
                        {state.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Team Lead (optional)</Label>
            <Controller
              name="team_lead_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="No lead" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No lead</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : mode === 'create' ? 'Create Team' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
