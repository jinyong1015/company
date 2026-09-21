import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
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

const MAX_ENTRIES = 500

/** Vercel 서버리스는 프로젝트 디렉터리 쓰기가 불가 → /tmp 사용 */
function resolveLogFile(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'qualitics-admin-change-log.json')
  }
  return path.join(process.cwd(), 'data', 'admin-change-log.json')
}

/** 인스턴스 메모리 캐시 (콜드스타트 시 파일에서 복원) */
let memoryCache: AdminChangeLogEntry[] | null = null

async function readAll(): Promise<AdminChangeLogEntry[]> {
  if (memoryCache) return memoryCache
  try {
    const raw = await readFile(resolveLogFile(), 'utf8')
    const parsed = JSON.parse(raw) as AdminChangeLogEntry[]
    memoryCache = Array.isArray(parsed) ? parsed : []
  } catch {
    memoryCache = []
  }
  return memoryCache
}

async function writeAll(entries: AdminChangeLogEntry[]) {
  memoryCache = entries
  const file = resolveLogFile()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(entries, null, 2), 'utf8')
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
  const next = [full, ...all].slice(0, MAX_ENTRIES)
  try {
    await writeAll(next)
  } catch {
    // 파일 저장 실패 시에도 메모리에는 유지 (서버리스 환경)
    memoryCache = next
  }
  return full
}

export async function listChangeLogs(limit = 50): Promise<AdminChangeLogEntry[]> {
  const all = await readAll()
  return all.slice(0, Math.max(1, Math.min(limit, 200)))
}
