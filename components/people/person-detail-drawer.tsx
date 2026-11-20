'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { PersonDetail } from './person-detail'

/** Right slide-over showing a person's full profile + leave history. */
export function PersonDetailDrawer({
  userId,
  onClose,
}: {
  userId: string | null
  onClose: () => void
}) {
  return (
    <Dialog.Root open={!!userId} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-background shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-5 py-3 backdrop-blur-sm">
            <Dialog.Title className="text-sm font-semibold">Employee details</Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Profile and full leave history for the selected employee.
          </Dialog.Description>
          <div className="p-5">{userId && <PersonDetail userId={userId} />}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
