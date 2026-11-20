import { listAuditEntries } from '@/lib/queries/audit'
import { AuditClient } from '@/components/audit/audit-client'

export default async function AuditPage() {
  const entries = await listAuditEntries(200)
  return <AuditClient entries={entries} />
}
