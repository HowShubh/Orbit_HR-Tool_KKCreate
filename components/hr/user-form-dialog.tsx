'use client'

import { useEffect, useTransition } from 'react'
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
import { createUser, updateUser } from '@/lib/actions/users'
import { updateUserPhoto } from '@/lib/actions/avatars'
import { PhotoUpload } from '@/components/ui/photo-upload'
import { useStore } from '@/lib/store'
import type { UserWithMembership } from '@/lib/queries/users'
import type { TeamWithMembers } from '@/lib/queries/teams'

const CreateSchema = z.object({
  full_name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be 8+ chars'),
  role: z.enum(['employee', 'team_lead', 'hr', 'founder']),
  manager_id: z.string().optional(),
  designation: z.string().optional(),
  primary_team_id: z.string().optional(),
  joined_at: z.string().optional(),
  date_of_birth: z.string().optional(),
})

const EditSchema = z.object({
  full_name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['employee', 'team_lead', 'hr', 'founder']),
  manager_id: z.string().optional(),
  designation: z.string().optional(),
  primary_team_id: z.string().optional(),
  slack_user_id: z.string().optional(),
  date_of_birth: z.string().optional(),
})

type CreateValues = z.infer<typeof CreateSchema>
type EditValues = z.infer<typeof EditSchema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  user?: UserWithMembership
  users: UserWithMembership[]
  teams: TeamWithMembers[]
}

export function UserFormDialog({ open, onOpenChange, mode, user, users, teams }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(CreateSchema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      role: 'employee',
      manager_id: '',
      designation: '',
      primary_team_id: '',
      joined_at: new Date().toISOString().split('T')[0],
      date_of_birth: '',
    },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(EditSchema),
    defaultValues: {
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      role: (user?.role as EditValues['role']) ?? 'employee',
      manager_id: user?.manager_id ?? '',
      designation: user?.designation ?? '',
      primary_team_id: user?.memberships.find((m) => m.is_primary)?.team_id ?? '',
      slack_user_id: user?.slack_user_id ?? '',
      date_of_birth: user?.date_of_birth ?? '',
    },
  })

  useEffect(() => {
    if (mode === 'edit' && user) {
      editForm.reset({
        full_name: user.full_name,
        email: user.email,
        role: user.role as EditValues['role'],
        manager_id: user.manager_id ?? '',
        designation: user.designation ?? '',
        primary_team_id: user.memberships.find((m) => m.is_primary)?.team_id ?? '',
        slack_user_id: user.slack_user_id ?? '',
        date_of_birth: user.date_of_birth ?? '',
      })
    }
    if (mode === 'create') {
      createForm.reset()
    }
  }, [open, user, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreate(data: CreateValues) {
    startTransition(async () => {
      try {
        await createUser({
          full_name: data.full_name,
          email: data.email,
          password: data.password,
          role: data.role,
          manager_id: data.manager_id || null,
          designation: data.designation || null,
          primary_team_id: data.primary_team_id || null,
          joined_at: data.joined_at,
          date_of_birth: data.date_of_birth || null,
        })
        pushToast({ title: 'User created', variant: 'success' })
        onOpenChange(false)
        createForm.reset()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create user'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleEdit(data: EditValues) {
    if (!user) return
    startTransition(async () => {
      try {
        await updateUser({
          id: user.id,
          full_name: data.full_name,
          email: data.email,
          role: data.role,
          manager_id: data.manager_id || null,
          designation: data.designation || null,
          primary_team_id: data.primary_team_id || null,
          slack_user_id: data.slack_user_id?.trim() ? data.slack_user_id.trim() : null,
          date_of_birth: data.date_of_birth || null,
        })
        pushToast({ title: 'User updated', variant: 'success' })
        onOpenChange(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update user'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  const otherUsers = users.filter((u) => u.id !== user?.id)

  if (mode === 'create') {
    const { register, handleSubmit, control, formState: { errors } } = createForm
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" {...register('full_name')} />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="team_lead">Team Lead</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="founder">Founder</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="designation">Designation</Label>
              <Input id="designation" {...register('designation')} />
            </div>
            <div className="space-y-1.5">
              <Label>Manager</Label>
              <Controller
                name="manager_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No manager</SelectItem>
                      {otherUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Primary Team</Label>
              <Controller
                name="primary_team_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No team</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="joined_at">Joined Date</Label>
              <Input id="joined_at" type="date" {...register('joined_at')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth">Date of Birth (optional)</Label>
              <Input id="date_of_birth" type="date" {...register('date_of_birth')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Create User'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    )
  }

  // Edit mode
  const { register, handleSubmit, control, formState: { errors } } = editForm
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleEdit)} className="space-y-4">
          {user && (
            <div className="flex flex-col items-center gap-2">
              <PhotoUpload
                name={user.full_name}
                src={user.photo_url}
                size="xl"
                onUpload={(fd) => updateUserPhoto(user.id, fd)}
              />
              <p className="text-[11px] text-muted-foreground">Profile photo</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full Name</Label>
            <Input id="full_name" {...register('full_name')} />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="team_lead">Team Lead</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="founder">Founder</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="designation">Designation</Label>
            <Input id="designation" {...register('designation')} />
          </div>
          <div className="space-y-1.5">
            <Label>Manager</Label>
            <Controller
              name="manager_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No manager</SelectItem>
                    {otherUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Primary Team</Label>
            <Controller
              name="primary_team_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit_slack_user_id">Slack member ID</Label>
            <Input id="edit_slack_user_id" placeholder="U0XXXXXXX (auto-matched by email)" {...register('slack_user_id')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit_date_of_birth">Date of Birth</Label>
            <Input id="edit_date_of_birth" type="date" {...register('date_of_birth')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save Changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
