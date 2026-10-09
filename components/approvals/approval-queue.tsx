import { listPendingApprovalsForReviewer } from '@/lib/queries/leave-requests'
import { ApprovalQueueClient } from './approval-queue-client'
import type { ApprovalQueueScope } from './leave-request-types'

export async function ApprovalQueue({
  reviewerUserId,
  scope,
}: {
  reviewerUserId: string
  scope: ApprovalQueueScope
}) {
  const requests = await listPendingApprovalsForReviewer(reviewerUserId, scope)
  return <ApprovalQueueClient initialRequests={requests} />
}
