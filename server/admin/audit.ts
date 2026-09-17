import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type AdminChangeLogEntry = {
  id: string
  recordId: string
  fields: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
  reason: string
  changedAt: string
  sessionId: string
  clientInfo: string
  statusBefore: {
    isAnalysisEligible: boolean
    errorCodes: string[]
  }
  statusAfter: {
    isAnalysisEligible: boolean
    errorCodes: string[]
  }
}

const LOG_DIR = path.join(process.cwd(), 'data')
const LOG_FILE = path.join(LOG_DIR, 'admin-change-log.json')
const MAX_ENTRIES = 500

async function readAll(): Promise<AdminChangeLogEntry[]> {
  try {
    const raw = await readFile(LOG_FILE, 'utf8')
    const parsed = JSON.parse(raw) as AdminChangeLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(entries: AdminChangeLogEntry[]) {
  await mkdir(LOG_DIR, { recursive: true })
  await writeFile(LOG_FILE, JSON.stringify(entries, null, 2), 'utf8')
}

export async function appendChangeLog(
  entry: Omit<AdminChangeLogEntry, 'id' | 'changedAt'>,
): Promise<AdminChangeLogEntry> {
  const full: AdminChangeLogEntry = {
    ...entry,
    id: `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    changedAt: new Date().toISOString(),
  }
  const all = await readAll()
  all.unshift(full)
  await writeAll(all.slice(0, MAX_ENTRIES))
  return full
}

export async function listChangeLogs(limit = 50): Promise<AdminChangeLogEntry[]> {
  const all = await readAll()
  return all.slice(0, Math.max(1, Math.min(limit, 200)))
}
