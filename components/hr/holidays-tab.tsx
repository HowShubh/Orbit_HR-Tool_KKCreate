'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus, Edit2, Trash2, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HolidayFormDialog } from './holiday-form-dialog'
import { HolidayCsvImport } from './holiday-csv-import'
import { deleteHoliday } from '@/lib/actions/holidays'
import { useStore } from '@/lib/store'
import type { Tables } from '@/lib/supabase/database.types'

interface Props {
  holidays: Tables<'holidays'>[]
}

export function HolidaysTab({ holidays }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<Tables<'holidays'> | undefined>()
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [csvOpen, setCsvOpen] = useState(false)

  function openCreate() {
    setEditingHoliday(undefined)
    setFormMode('create')
    setFormOpen(true)
  }

  function openEdit(h: Tables<'holidays'>) {
    setEditingHoliday(h)
    setFormMode('edit')
    setFormOpen(true)
  }

  function handleDelete(h: Tables<'holidays'>) {
    if (!window.confirm(`Delete "${h.name}" on ${h.date}?`)) return
    startTransition(async () => {
      try {
        await deleteHoliday(h.id)
        pushToast({ title: 'Holiday deleted', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="p-4 flex items-center justify-between gap-3 border-b">
            <div className="text-[13px] text-muted-foreground">
              {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} this year
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCsvOpen(true)}>
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add Holiday
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground bg-muted/40">
                  <th className="font-medium px-4 py-3">Date</th>
                  <th className="font-medium px-4 py-3">Name</th>
                  <th className="font-medium px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-[13px] whitespace-nowrap">
                      {format(parseISO(h.date), 'EEE, MMM d yyyy')}
                    </td>
                    <td className="px-4 py-3 font-medium">{h.name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(h)}>
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:text-rose-600"
                          disabled={isPending}
                          onClick={() => handleDelete(h)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {holidays.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No holidays added yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <HolidayFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        holiday={editingHoliday}
      />

      <HolidayCsvImport open={csvOpen} onOpenChange={setCsvOpen} />
    </>
  )
}
