import type { Status } from '../../types'

const styles: Record<Status, string> = {
  정상: 'bg-ok-soft text-ok',
  주의: 'bg-warn-soft text-warn',
  위험: 'bg-danger-soft text-danger',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  )
}
