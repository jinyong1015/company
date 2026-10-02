import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Lock,
  Maximize2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Panel } from '../common/Panel'
import { WeeklyFullscreenOverlay } from './WeeklyFullscreenOverlay'
import { getProductPhotoUrlMap } from '../../lib/productPhotos'
import { isCloudSyncEnabled } from '../../lib/supabase'
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

function issueProductKey(issue: WeeklyIssue): string | null {
  const key = issue.product?.trim()
  return key || null
}

function IssueProductThumb({
  productKey,
  url,
  size = 'sm',
}: {
  productKey: string
  url?: string
  size?: 'sm' | 'lg'
}) {
  const box =
    size === 'lg'
      ? 'h-28 w-28 sm:h-32 sm:w-32'
      : 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]'

  if (!url) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg border border-dashed border-line bg-canvas text-center text-[10px] leading-tight text-muted ${box}`}
        title={`${productKey} 제품 사진 없음`}
      >
        사진 없음
      </div>
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas ${box}`}
    >
      <img
        src={url}
        alt={`${productKey} 제품 사진`}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
      />
    </div>
  )
}

function ProductFinder({
  value,
  options,
  photoUrl,
  onChange,
}: {
  value?: string
  options: string[]
  photoUrl?: string
  onChange: (product: string | undefined) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 12)
    return options
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 12)
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {value ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent">
              품번 {value}
              <button
                type="button"
                className="rounded p-0.5 hover:bg-white/60"
                aria-label="품번 연결 해제"
                onClick={() => {
                  onChange(undefined)
                  setQuery('')
                }}
              >
                <X size={12} />
              </button>
            </span>
            <button
              type="button"
              className="text-xs text-muted hover:text-ink"
              onClick={() => {
                setQuery(value)
                setOpen(true)
              }}
            >
              다시 찾기
            </button>
          </div>
        ) : (
          <div className="relative">
            <label className="mb-1 block text-[11px] text-muted">품번 찾기</label>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                placeholder="품번 검색…"
                className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-2 text-sm"
              />
            </div>
            {open ? (
              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-md">
                {filtered.length ? (
                  filtered.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
                        onClick={() => {
                          onChange(p)
                          setQuery('')
                          setOpen(false)
                        }}
                      >
                        {p}
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-sm text-muted">검색 결과 없음</li>
                )}
              </ul>
            ) : null}
          </div>
        )}
      </div>
      {value ? (
        <IssueProductThumb productKey={value} url={photoUrl} />
      ) : null}
    </div>
  )
}

export function WeeklyIssuePanel({
  issues,
  productOptions = [],
  onSave,
  onAiGenerate,
  saving = false,
  cloudSync = false,
  syncReady = true,
  canEdit = false,
  onRequestLogin,
}: {
  issues: WeeklyIssue[]
  /** 품번 찾기용 후보 목록 */
  productOptions?: string[]
  onSave: (issues: WeeklyIssue[]) => void | Promise<void>
  onAiGenerate: () => WeeklyIssue[]
  saving?: boolean
  cloudSync?: boolean
  syncReady?: boolean
  canEdit?: boolean
  onRequestLogin?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [draft, setDraft] = useState(() => cloneIssues(issues))
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const photoSourceIssues = editing ? draft : issues

  const productKeys = useMemo(() => {
    const keys = photoSourceIssues
      .map((issue) => issueProductKey(issue))
      .filter((k): k is string => Boolean(k))
    return [...new Set(keys)].sort()
  }, [photoSourceIssues])

  const productKeysSignature = productKeys.join('\u0001')

  useEffect(() => {
    if (!isCloudSyncEnabled() || !productKeys.length) {
      setPhotoUrls({})
      return
    }
    let cancelled = false
    void getProductPhotoUrlMap(productKeys).then((map) => {
      if (!cancelled) setPhotoUrls(map)
    })
    return () => {
      cancelled = true
    }
    // productKeysSignature tracks content; productKeys used inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeysSignature])

  useEffect(() => {
    if (!editing) {
      setDraft(cloneIssues(issues))
    }
  }, [issues, editing])

  useEffect(() => {
    if (!canEdit && editing) {
      setDraft(cloneIssues(issues))
      setEditing(false)
    }
  }, [canEdit, editing, issues])

  const startEdit = () => {
    if (!canEdit) {
      onRequestLogin?.()
      return
    }
    setDraft(cloneIssues(issues.length ? issues : [newIssue(1)]))
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(cloneIssues(issues))
    setEditing(false)
  }

  const save = async () => {
    const saved = draft
      .map((i, idx) => {
        const product = i.product?.trim() || undefined
        return {
          ...i,
          order: idx + 1,
          source: 'manual' as const,
          title: i.title.trim(),
          bullets: normalizeBullets(i.bullets),
          product,
        }
      })
      .filter((i) => i.title || i.bullets.length > 0)

    await onSave(saved)
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

  const openFullscreen = () => {
    if (editing) {
      setDraft(cloneIssues(issues))
      setEditing(false)
    }
    setFullscreen(true)
  }

  const description = cloudSync
    ? syncReady
      ? '주요 품질 이슈'
      : '주요 품질 이슈 · 공유 데이터 불러오는 중…'
    : '주요 품질 이슈'

  const editActions = (
    <>
      {editing && canEdit ? (
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
        {draft.map((issue, idx) => {
          const productKey = issueProductKey(issue)
          return (
            <div
              key={issue.id}
              className="rounded-xl border border-line bg-canvas/50 p-3"
            >
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
                rows={4}
                className="mb-3 w-full resize-y rounded-lg border border-line bg-white px-2 py-1.5 text-sm leading-relaxed"
                placeholder="상세 내용 (Enter로 줄바꿈)"
              />
              <ProductFinder
                value={productKey ?? undefined}
                options={productOptions}
                photoUrl={productKey ? photoUrls[productKey] : undefined}
                onChange={(product) => updateIssue(idx, { product })}
              />
            </div>
          )
        })}

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
        {issues.map((issue) => {
          const productKey = issueProductKey(issue)
          const photoUrl = productKey ? photoUrls[productKey] : undefined
          return (
            <li key={issue.id} className="text-sm">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {issue.order}. {issue.title}
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
                    {issue.bullets.map((b, bulletIdx) => (
                      <li key={`${issue.id}-${bulletIdx}`}>{b}</li>
                    ))}
                  </ul>
                </div>
                {productKey ? (
                  <IssueProductThumb productKey={productKey} url={photoUrl} />
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    ) : (
      <p className="text-sm text-muted">등록된 주간 이슈가 없습니다.</p>
    )

  const fullscreenBody = issues.length ? (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {issues.map((issue) => {
        const productKey = issueProductKey(issue)
        const photoUrl = productKey ? photoUrls[productKey] : undefined
        return (
          <article
            key={issue.id}
            className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7"
          >
            <div className="flex items-start gap-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-base font-bold text-accent sm:h-11 sm:w-11 sm:text-lg"
                aria-hidden
              >
                {issue.order}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="text-lg font-semibold leading-snug tracking-tight text-ink sm:text-xl">
                  {issue.title}
                </h3>
                {issue.bullets.length ? (
                  <ul className="mt-4 space-y-2.5 border-t border-line/70 pt-4">
                    {issue.bullets.map((b, bulletIdx) => (
                      <li
                        key={`${issue.id}-${bulletIdx}`}
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
              {productKey ? (
                <IssueProductThumb
                  productKey={productKey}
                  url={photoUrl}
                  size="lg"
                />
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  ) : (
    <div className="mx-auto flex w-full max-w-4xl items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-16">
      <p className="text-base text-muted sm:text-lg">
        등록된 주간 이슈가 없습니다.
      </p>
    </div>
  )

  return (
    <>
      <Panel
        title="WORST 주간 ISSUE"
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
        title="WORST 주간 ISSUE"
        description={description}
        onClose={() => setFullscreen(false)}
      >
        {fullscreenBody}
      </WeeklyFullscreenOverlay>
    </>
  )
}
