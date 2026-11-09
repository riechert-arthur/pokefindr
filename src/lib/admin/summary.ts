/** GET /api/admin/summary (#152, #158): what the sidebar counts and the summary cards show. */
export interface AdminSummary {
  queue: {
    count: number
    /** The oldest pending submission's time, or null when the queue is clear. */
    oldestAt: string | null
  }
  /** Open reports (#153): the locations with any, how many in all, and the most on one location. */
  reports: { locations: number; reports: number; maxOnOne: number }
}

/** A submission waiting longer than this is late: its count turns red. */
export const QUEUE_LATE_MS = 24 * 60 * 60 * 1000

export const queueIsLate = (s: AdminSummary["queue"], now = Date.now()) => s.oldestAt !== null && now - Date.parse(s.oldestAt) > QUEUE_LATE_MS
