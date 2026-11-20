'use client'

import { useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
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
import { createHoliday, updateHoliday } from '@/lib/actions/holidays'
import { useStore } from '@/lib/store'
import type { Tables } from '@/lib/supabase/database.types'

const Schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  name: z.string().min(1, 'Name required'),
})

type FormValues = z.infer<typeof Schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  holiday?: Tables<'holidays'>
}

export function HolidayFormDialog({ open, onOpenChange, mode, holiday }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { date: '', name: '' },
  })

  useEffect(() => {
    if (mode === 'edit' && holiday) {
      reset({ date: holiday.date, name: holiday.name })
    } else {
      reset({ date: '', name: '' })
    }
  }, [open, holiday, mode, reset])

  function onSubmit(data: FormValues) {
    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createHoliday(data)
          pushToast({ title: 'Holiday added', variant: 'success' })
        } else if (holiday) {
          await updateHoliday({ id: holiday.id, ...data })
          pushToast({ title: 'Holiday updated', variant: 'success' })
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
          <DialogTitle>{mode === 'create' ? 'Add Holiday' : 'Edit Holiday'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register('date')} />
            {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Holiday Name</Label>
            <Input id="name" {...register('name')} placeholder="e.g. Republic Day" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : mode === 'create' ? 'Add Holiday' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
