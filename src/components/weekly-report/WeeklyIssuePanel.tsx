import { useEffect, useState } from 'react'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { Panel } from '../common/Panel'
import type { WeeklyIssue } from '../../types'

function normalizeBullets(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean)
}

function cloneIssues(issues: WeeklyIssue[]) {
  return issues.map((i) => ({ ...i, bullets: [...i.bullets] }))
}

function newIssue(order: number): WeeklyIssue {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source: 'manual',
    order,
    title: '',
    bullets: [''],
  }
}

export function WeeklyIssuePanel({
  issues,
  onSave,
  onAiGenerate,
}: {
  issues: WeeklyIssue[]
  onSave: (issues: WeeklyIssue[]) => void
  onAiGenerate: () => WeeklyIssue[]
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => cloneIssues(issues))

  useEffect(() => {
    if (!editing) {
      setDraft(cloneIssues(issues))
    }
  }, [issues, editing])

  const startEdit = () => {
    setDraft(cloneIssues(issues.length ? issues : [newIssue(1)]))
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(cloneIssues(issues))
    setEditing(false)
  }

  const save = () => {
    const saved = draft
      .map((i, idx) => ({
        ...i,
        order: idx + 1,
        source: 'manual' as const,
        title: i.title.trim(),
        bullets: normalizeBullets(i.bullets),
      }))
      .filter((i) => i.title || i.bullets.length > 0)

    onSave(saved)
    setEditing(false)
  }

  const addIssue = () => {
    setDraft((prev) => [...prev, newIssue(prev.length + 1)])
  }

  const removeIssue = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateIssue = (idx: number, patch: Partial<WeeklyIssue>) => {
    setDraft((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  const runAiGenerate = () => {
    const generated = onAiGenerate()
    setDraft(cloneIssues(generated.length ? generated : [newIssue(1)]))
  }

  return (
    <Panel
      title="주간 ISSUE"
      description="주요 품질 이슈 · 원인 · 개선조치"
      actions={
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={runAiGenerate}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
              >
                <Sparkles size={12} />
                AI 생성
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white"
              >
                저장
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
            >
              편집
            </button>
          )}
        </div>
      }
    >
      {editing ? (
        <div className="space-y-4">
          {draft.map((issue, idx) => (
            <div key={issue.id} className="rounded-xl border border-line bg-canvas/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-muted">{idx + 1}.</span>
                <input
                  value={issue.title}
                  onChange={(e) => updateIssue(idx, { title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                  placeholder="이슈 제목"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => removeIssue(idx)}
                  className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  aria-label={`${idx + 1}번 이슈 삭제`}
                  title="항목 삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                value={issue.bullets.join('\n')}
                onChange={(e) =>
                  updateIssue(idx, { bullets: e.target.value.split('\n') })
                }
                rows={5}
                className="w-full resize-y rounded-lg border border-line bg-white px-2 py-1.5 text-sm leading-relaxed"
                placeholder="상세 내용 (Enter로 줄바꿈)"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addIssue}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm text-muted transition hover:border-accent hover:text-accent"
          >
            <Plus size={14} />
            이슈 항목 추가
          </button>
        </div>
      ) : issues.length ? (
        <ol className="space-y-4">
          {issues.map((issue) => (
            <li key={issue.id} className="text-sm">
              <p className="font-medium text-ink">
                {issue.order}. {issue.title}
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
                {issue.bullets.map((b, bulletIdx) => (
                  <li key={`${issue.id}-${bulletIdx}`}>{b}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">등록된 주간 이슈가 없습니다.</p>
      )}
    </Panel>
  )
}
