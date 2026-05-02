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
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { TeamWithMembers } from '@/lib/queries/teams'
import type { UserWithMembership } from '@/lib/queries/users'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
type Day = (typeof DAYS)[number]

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
  const [selectedDays, setSelectedDays] = useState<Day[]>([])

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
      const days = team.wfo_pattern
        ? team.wfo_pattern.split(',').filter((d): d is Day => DAYS.includes(d as Day))
        : []
      setSelectedDays(days)
    } else {
      reset({ name: '', team_lead_id: '' })
      setSelectedDays(['MON', 'TUE', 'WED', 'THU', 'FRI'])
    }
  }, [open, team, mode, reset])

  function toggleDay(day: Day) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  function onSubmit(data: FormValues) {
    const wfo_pattern = selectedDays.join(',')

    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createTeam({
            name: data.name,
            wfo_pattern,
            team_lead_id: data.team_lead_id || null,
          })
          pushToast({ title: 'Team created', variant: 'success' })
        } else if (team) {
          await updateTeam({
            id: team.id,
            name: data.name,
            wfo_pattern,
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
          <div className="space-y-1.5">
            <Label htmlFor="name">Team Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>WFO Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors',
                    selectedDays.includes(day)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  )}
                >
                  {day}
                </button>
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
