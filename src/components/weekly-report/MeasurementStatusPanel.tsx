import { useEffect, useState } from 'react'
import { Lock, Maximize2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Panel } from '../common/Panel'
import { WeeklyFullscreenOverlay } from './WeeklyFullscreenOverlay'
import type { MeasurementStatusItem } from '../../types'

function normalizeBullets(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean)
}

function cloneItems(items: MeasurementStatusItem[]) {
  return items.map((i) => ({ ...i, bullets: [...i.bullets] }))
}

function newItem(order: number): MeasurementStatusItem {
  return {
    id: `measurement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    order,
    title: '',
    bullets: [''],
  }
}

export function MeasurementStatusPanel({
  items,
  onSave,
  saving = false,
  cloudSync = false,
  syncReady = true,
  canEdit = false,
  onRequestLogin,
}: {
  items: MeasurementStatusItem[]
  onSave: (items: MeasurementStatusItem[]) => void | Promise<void>
  saving?: boolean
  cloudSync?: boolean
  syncReady?: boolean
  canEdit?: boolean
  onRequestLogin?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [draft, setDraft] = useState(() => cloneItems(items))

  useEffect(() => {
    if (!editing) {
      setDraft(cloneItems(items))
    }
  }, [items, editing])

  useEffect(() => {
    if (!canEdit && editing) {
      setDraft(cloneItems(items))
      setEditing(false)
    }
  }, [canEdit, editing, items])

  const startEdit = () => {
    if (!canEdit) {
      onRequestLogin?.()
      return
    }
    setDraft(cloneItems(items.length ? items : [newItem(1)]))
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(cloneItems(items))
    setEditing(false)
  }

  const save = async () => {
    const saved = draft
      .map((i, idx) => ({
        ...i,
        order: idx + 1,
        title: i.title.trim(),
        bullets: normalizeBullets(i.bullets),
      }))
      .filter((i) => i.title || i.bullets.length > 0)

    await onSave(saved)
    setEditing(false)
  }

  const addItem = () => {
    setDraft((prev) => [...prev, newItem(prev.length + 1)])
  }

  const removeItem = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, patch: Partial<MeasurementStatusItem>) => {
    setDraft((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  const openFullscreen = () => {
    if (editing) {
      setDraft(cloneItems(items))
      setEditing(false)
    }
    setFullscreen(true)
  }

  const description = cloudSync
    ? syncReady
      ? '측정·검사 진행 현황'
      : '측정·검사 진행 현황 · 공유 데이터 불러오는 중…'
    : '측정·검사 진행 현황'

  const editActions = (
    <>
      {editing && canEdit ? (
        <>
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
          title={canEdit ? '편집' : '실무자/관리자 로그인 후 편집'}
        >
          {canEdit ? <Pencil size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
          편집
        </button>
      )}
    </>
  )

  const panelBody =
    editing && canEdit ? (
      <div className="space-y-4">
        {draft.map((item, idx) => (
          <div
            key={item.id}
            className="rounded-xl border border-line bg-canvas/50 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">{idx + 1}.</span>
              <input
                value={item.title}
                onChange={(e) => updateItem(idx, { title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault()
                }}
                placeholder="측정·항목 제목"
                className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-medium"
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={`${idx + 1}번 항목 삭제`}
                title="항목 삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={item.bullets.join('\n')}
              onChange={(e) =>
                updateItem(idx, { bullets: e.target.value.split('\n') })
              }
              rows={4}
              className="w-full resize-y rounded-lg border border-line bg-white px-2 py-1.5 text-sm leading-relaxed"
              placeholder="상세 내용 (Enter로 줄바꿈)"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm text-muted transition hover:border-accent hover:text-accent"
        >
          <Plus size={14} />
          항목 추가
        </button>
      </div>
    ) : items.length ? (
      <ol className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <p className="font-medium text-ink">
              {item.order}. {item.title}
            </p>
            {item.bullets.length ? (
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
                {item.bullets.map((b, bulletIdx) => (
                  <li key={`${item.id}-${bulletIdx}`}>{b}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-sm text-muted">등록된 측정현황이 없습니다.</p>
    )

  const fullscreenBody = items.length ? (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7"
        >
          <div className="flex items-start gap-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-base font-bold text-accent sm:h-11 sm:w-11 sm:text-lg"
              aria-hidden
            >
              {item.order}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="text-lg font-semibold leading-snug tracking-tight text-ink sm:text-xl">
                {item.title}
              </h3>
              {item.bullets.length ? (
                <ul className="mt-4 space-y-2.5 border-t border-line/70 pt-4">
                  {item.bullets.map((b, bulletIdx) => (
                    <li
                      key={`${item.id}-${bulletIdx}`}
                      className="flex gap-3 text-[15px] leading-7 text-ink/80 sm:text-base sm:leading-8"
                    >
                      <span
                        className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70"
                        aria-hidden
                      />
                      <span className="min-w-0">{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <div className="mx-auto flex w-full max-w-4xl items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-16">
      <p className="text-base text-muted sm:text-lg">
        등록된 측정현황이 없습니다.
      </p>
    </div>
  )

  return (
    <>
      <Panel
        title="측정현황"
        description={description}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn inline-flex items-center gap-1.5 text-xs"
              onClick={openFullscreen}
            >
              <Maximize2 size={14} strokeWidth={2.25} aria-hidden />
              전체화면 보기
            </button>
            {editActions}
          </div>
        }
      >
        {panelBody}
      </Panel>

      <WeeklyFullscreenOverlay
        open={fullscreen}
        title="4. 측정현황"
        description={description}
        onClose={() => setFullscreen(false)}
      >
        {fullscreenBody}
      </WeeklyFullscreenOverlay>
    </>
  )
}
