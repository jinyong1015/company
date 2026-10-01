import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Maximize2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Panel } from '../common/Panel'
import { WeeklyFullscreenOverlay } from './WeeklyFullscreenOverlay'
import {
  CustomerNcPhotos,
  type PendingNcPhoto,
} from './CustomerNcPhotos'
import { useToast } from '../../context/ToastContext'
import { getProductPhotoUrlMap } from '../../lib/productPhotos'
import {
  deleteNonconformityPhoto,
  hydrateNonconformityPhotoRows,
  listNonconformityPhotosByIds,
  moveNonconformityPhotosToItemCode,
  uploadNonconformityPhoto,
  type NonconformityPhotoRow,
  type NonconformityPhotoView,
} from '../../lib/nonconformityPhotos'
import { isCloudSyncEnabled } from '../../lib/supabase'
import { cleanCustomerNcItems } from '../../lib/weeklyReportCustomerNc'
import type { CustomerNcItem } from '../../types'

function cloneItems(items: CustomerNcItem[]) {
  return items.map((i) => ({ ...i }))
}

function newItem(order: number): CustomerNcItem {
  return {
    id: `cnc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    order,
    occurredOn: '',
    location: '',
    quantity: '',
    defectName: '',
    actions: '',
  }
}

function ProductThumb({
  productKey,
  url,
  size = 'sm',
}: {
  productKey: string
  url?: string
  size?: 'sm' | 'lg'
}) {
  const box = size === 'lg' ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-14 w-14'

  if (!url) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded border border-dashed border-line bg-canvas text-center text-[9px] leading-tight text-muted ${box}`}
        title={`${productKey} 제품 사진 없음`}
      >
        사진 없음
      </div>
    )
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-canvas ${box}`}
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
    return options.filter((p) => p.toLowerCase().includes(q)).slice(0, 12)
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
              {value}
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
              className="text-[11px] text-muted hover:text-ink"
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
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
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
                className="w-full rounded border border-line bg-white py-1 pl-7 pr-2 text-xs"
              />
            </div>
            {open ? (
              <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded border border-line bg-white py-1 shadow-md">
                {filtered.length ? (
                  filtered.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent-soft"
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
                  <li className="px-2.5 py-2 text-xs text-muted">검색 결과 없음</li>
                )}
              </ul>
            ) : null}
          </div>
        )}
      </div>
      {value ? <ProductThumb productKey={value} url={photoUrl} /> : null}
    </div>
  )
}

function multilineDisplay(text: string) {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length)
  if (!lines.length) return null
  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed">
      {lines.join('\n')}
    </div>
  )
}

function TableHead({ showEditCols }: { showEditCols: boolean }) {
  return (
    <thead>
      <tr className="bg-canvas text-left text-xs font-semibold text-ink">
        <th className="border border-line px-2 py-2 whitespace-nowrap">발생일</th>
        <th className="border border-line px-2 py-2 whitespace-nowrap">발생장소</th>
        <th className="border border-line px-2 py-2 whitespace-nowrap">발생수량</th>
        <th className="border border-line px-2 py-2 min-w-[12rem]">부적합명</th>
        <th className="border border-line px-2 py-2 min-w-[14rem]">조치현황</th>
        {showEditCols ? (
          <th className="border border-line px-2 py-2 w-10 text-center"> </th>
        ) : null}
      </tr>
    </thead>
  )
}

function CustomerNcTable({
  items,
  photoUrls,
  ncPhotosMap,
  pendingByNc,
  deletedByNc,
  editing,
  canEdit,
  draft,
  productOptions,
  onUpdate,
  onRemove,
  onProductChange,
  onAddPending,
  onRemovePending,
  onMarkSavedDeleted,
}: {
  items: CustomerNcItem[]
  photoUrls: Record<string, string>
  ncPhotosMap: Record<string, NonconformityPhotoView[]>
  pendingByNc: Record<string, PendingNcPhoto[]>
  deletedByNc: Record<string, string[]>
  editing: boolean
  canEdit: boolean
  draft: CustomerNcItem[]
  productOptions: string[]
  onUpdate: (idx: number, patch: Partial<CustomerNcItem>) => void
  onRemove: (idx: number) => void
  onProductChange: (
    idx: number,
    product: string | undefined,
  ) => void | Promise<void>
  onAddPending: (ncId: string, file: File) => void
  onRemovePending: (ncId: string, localId: string) => void
  onMarkSavedDeleted: (ncId: string, photoId: string) => void
}) {
  const rows = editing && canEdit ? draft : items
  const showEditCols = editing && canEdit

  return (
    <div className="space-y-8">
      {rows.map((item, idx) => {
        const productKey = item.product?.trim()
        const photos = ncPhotosMap[item.id] ?? []
        const pending = pendingByNc[item.id] ?? []
        const deletedIds = deletedByNc[item.id] ?? []
        const orderLabel = `.${idx + 1})`
        const showPhotos =
          showEditCols ||
          photos.some((p) => !deletedIds.includes(p.id)) ||
          pending.length > 0

        return (
          <div key={item.id} className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <TableHead showEditCols={showEditCols} />
                <tbody>
                  {showEditCols ? (
                    <tr className="align-top">
                      <td className="border border-line p-1.5">
                        <input
                          value={item.occurredOn}
                          onChange={(e) =>
                            onUpdate(idx, { occurredOn: e.target.value })
                          }
                          placeholder="9/22"
                          className="w-full min-w-[4.5rem] rounded border border-line bg-white px-1.5 py-1 text-xs"
                        />
                      </td>
                      <td className="border border-line p-1.5">
                        <input
                          value={item.location}
                          onChange={(e) =>
                            onUpdate(idx, { location: e.target.value })
                          }
                          placeholder="발생장소"
                          className="w-full min-w-[5rem] rounded border border-line bg-white px-1.5 py-1 text-xs"
                        />
                      </td>
                      <td className="border border-line p-1.5">
                        <input
                          value={item.quantity}
                          onChange={(e) =>
                            onUpdate(idx, { quantity: e.target.value })
                          }
                          placeholder="3ea"
                          className="w-full min-w-[3.5rem] rounded border border-line bg-white px-1.5 py-1 text-xs"
                        />
                      </td>
                      <td className="border border-line p-1.5">
                        <div className="space-y-2">
                          <ProductFinder
                            value={productKey}
                            options={productOptions}
                            photoUrl={
                              productKey ? photoUrls[productKey] : undefined
                            }
                            onChange={(product) =>
                              void onProductChange(idx, product)
                            }
                          />
                          <textarea
                            value={item.defectName}
                            onChange={(e) =>
                              onUpdate(idx, { defectName: e.target.value })
                            }
                            rows={3}
                            placeholder={'외관불량\n(이물질 등)'}
                            className="w-full resize-y rounded border border-line bg-white px-1.5 py-1 text-xs leading-relaxed"
                          />
                        </div>
                      </td>
                      <td className="border border-line p-1.5">
                        <textarea
                          value={item.actions}
                          onChange={(e) =>
                            onUpdate(idx, { actions: e.target.value })
                          }
                          rows={5}
                          placeholder="조치 내용을 줄바꿈으로 입력"
                          className="w-full resize-y rounded border border-line bg-white px-1.5 py-1 text-xs leading-relaxed"
                        />
                      </td>
                      <td className="border border-line p-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => onRemove(idx)}
                          className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                          aria-label={`${idx + 1}번 행 삭제`}
                          title="행 삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr className="align-top">
                      <td className="border border-line px-2 py-2 whitespace-nowrap text-ink">
                        {item.occurredOn || '—'}
                      </td>
                      <td className="border border-line px-2 py-2 text-ink">
                        {item.location || '—'}
                      </td>
                      <td className="border border-line px-2 py-2 whitespace-nowrap text-ink">
                        {item.quantity || '—'}
                      </td>
                      <td className="border border-line px-2 py-2 text-ink">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            {productKey ? (
                              <p className="font-medium text-ink">{productKey}</p>
                            ) : null}
                            {multilineDisplay(item.defectName)}
                            {!productKey && !item.defectName.trim() ? (
                              <span className="text-muted">—</span>
                            ) : null}
                          </div>
                          {productKey ? (
                            <ProductThumb
                              productKey={productKey}
                              url={photoUrls[productKey]}
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="border border-line px-2 py-2 text-ink">
                        {multilineDisplay(item.actions) ?? (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {showPhotos ? (
              <CustomerNcPhotos
                itemCode={productKey}
                canEdit={showEditCols}
                orderLabel={orderLabel}
                savedPhotos={photos}
                pendingPhotos={pending}
                deletedPhotoIds={deletedIds}
                onAddPending={(file) => onAddPending(item.id, file)}
                onRemovePending={(localId) =>
                  onRemovePending(item.id, localId)
                }
                onMarkSavedDeleted={(photoId) =>
                  onMarkSavedDeleted(item.id, photoId)
                }
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function CustomerNcPanel({
  items,
  productOptions = [],
  periodKey,
  periodLabel,
  /** 스냅샷 확정본에 동결된 사진. 있으면 실시간 DB 조회 대신 사용 */
  frozenPhotos,
  onSave,
  saving = false,
  cloudSync = false,
  syncReady = true,
  canEdit = false,
  onRequestLogin,
}: {
  items: CustomerNcItem[]
  productOptions?: string[]
  /** 월/주/조회기간 키 — 변경 시 편집 모드 해제·데이터 갱신 */
  periodKey?: string
  /** 현재 조회 기간 표시 (예: 09월 5주차) */
  periodLabel?: string
  frozenPhotos?: Record<string, NonconformityPhotoRow[]> | null
  onSave: (items: CustomerNcItem[]) => void | Promise<void>
  saving?: boolean
  cloudSync?: boolean
  syncReady?: boolean
  canEdit?: boolean
  onRequestLogin?: () => void
}) {
  const { pushToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [draft, setDraft] = useState(() => cloneItems(items))
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [ncPhotosMap, setNcPhotosMap] = useState<
    Record<string, NonconformityPhotoView[]>
  >({})
  const [pendingByNc, setPendingByNc] = useState<
    Record<string, PendingNcPhoto[]>
  >({})
  const [deletedByNc, setDeletedByNc] = useState<Record<string, string[]>>({})
  const [photoCommitting, setPhotoCommitting] = useState(false)

  const photoSource = editing ? draft : items
  const productKeys = useMemo(() => {
    const keys = photoSource
      .map((i) => i.product?.trim())
      .filter((k): k is string => Boolean(k))
    return [...new Set(keys)].sort()
  }, [photoSource])
  const productKeysSignature = productKeys.join('\u0001')

  const ncIds = useMemo(
    () => photoSource.map((i) => i.id).filter(Boolean),
    [photoSource],
  )
  const ncIdsSignature = ncIds.join('\u0001')

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeysSignature])

  useEffect(() => {
    if (!isCloudSyncEnabled()) {
      setNcPhotosMap({})
      return
    }
    let cancelled = false

    // 스냅샷 보기: 확정본에 저장된 사진 메타 + signed URL
    if (frozenPhotos != null) {
      void hydrateNonconformityPhotoRows(frozenPhotos).then((map) => {
        if (!cancelled) setNcPhotosMap(map)
      })
      return () => {
        cancelled = true
      }
    }

    if (!ncIds.length) {
      setNcPhotosMap({})
      return
    }
    void listNonconformityPhotosByIds(ncIds, periodKey ?? '').then((map) => {
      if (!cancelled) setNcPhotosMap(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncIdsSignature, periodKey, frozenPhotos])

  const clearPendingPhotos = () => {
    setPendingByNc((prev) => {
      for (const list of Object.values(prev)) {
        for (const p of list) URL.revokeObjectURL(p.previewUrl)
      }
      return {}
    })
    setDeletedByNc({})
  }

  // 기간(주차·조회기간)이 바뀌면 ISSUE와 같이 편집을 끝내고 새 기간 데이터를 보여 준다
  useEffect(() => {
    clearPendingPhotos()
    setDraft(cloneItems(items))
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- periodKey 변경 시에만 편집 해제
  }, [periodKey])

  useEffect(() => {
    if (!editing) setDraft(cloneItems(items))
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
    clearPendingPhotos()
    setDraft(cloneItems(items.length ? items : [newItem(1)]))
    setEditing(true)
  }

  const cancelEdit = () => {
    clearPendingPhotos()
    setDraft(cloneItems(items))
    setEditing(false)
  }

  const save = async () => {
    const cleaned = cleanCustomerNcItems(draft)
    const key = periodKey ?? ''
    setPhotoCommitting(true)
    try {
      // 1) 삭제 예정 사진 → DB/Storage 반영
      for (const [ncId, ids] of Object.entries(deletedByNc)) {
        for (const photoId of ids) {
          const result = await deleteNonconformityPhoto(photoId)
          if (!result.ok) {
            pushToast(result.error, 'error')
            return
          }
        }
        setNcPhotosMap((prev) => ({
          ...prev,
          [ncId]: (prev[ncId] ?? []).filter((p) => !ids.includes(p.id)),
        }))
      }

      // 2) 미리보기 사진 → 현황 저장과 함께 업로드·DB 기록
      for (const item of cleaned) {
        const pending = pendingByNc[item.id] ?? []
        const code = item.product?.trim()
        if (!pending.length) continue
        if (!code) {
          pushToast(
            '품번이 없는 행의 미리보기 사진은 저장되지 않습니다. 품번을 선택한 뒤 다시 추가해 주세요.',
            'info',
          )
          continue
        }
        for (const p of pending) {
          const result = await uploadNonconformityPhoto(
            key,
            item.id,
            code,
            p.file,
          )
          if (!result.ok) {
            pushToast(result.error, 'error')
            return
          }
          setNcPhotosMap((prev) => ({
            ...prev,
            [item.id]: [...(prev[item.id] ?? []), result.photo],
          }))
        }
      }

      await onSave(cleaned)
      clearPendingPhotos()
      setEditing(false)
    } finally {
      setPhotoCommitting(false)
    }
  }

  const addItem = () => {
    setDraft((prev) => [...prev, newItem(prev.length + 1)])
  }

  const removeItem = (idx: number) => {
    const target = draft[idx]
    setDraft((prev) => prev.filter((_, i) => i !== idx))
    if (!target?.id) return
    // DB는 현황 저장 시 prune. 편집 중에는 로컬만 정리.
    setPendingByNc((prev) => {
      const list = prev[target.id]
      if (list) {
        for (const p of list) URL.revokeObjectURL(p.previewUrl)
      }
      const next = { ...prev }
      delete next[target.id]
      return next
    })
    setDeletedByNc((prev) => {
      const next = { ...prev }
      delete next[target.id]
      return next
    })
  }

  const updateItem = (idx: number, patch: Partial<CustomerNcItem>) => {
    setDraft((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  const handleProductChange = async (
    idx: number,
    product: string | undefined,
  ) => {
    const item = draft[idx]
    if (!item) return
    const prev = item.product?.trim()
    const next = product?.trim()

    // 이미 DB에 있는 사진만 품번 폴더 이동 (미리보기는 저장 시 새 품번으로 업로드)
    if (prev && next && prev !== next && isCloudSyncEnabled()) {
      const saved = ncPhotosMap[item.id] ?? []
      if (saved.length) {
        const result = await moveNonconformityPhotosToItemCode(
          item.id,
          next,
          periodKey,
        )
        if (!result.ok) {
          pushToast(result.error, 'error')
          return
        }
        setNcPhotosMap((map) => ({ ...map, [item.id]: result.photos }))
        pushToast('품번 변경에 맞춰 저장된 부적합 사진을 이동했습니다.', 'success')
      }
    }

    updateItem(idx, { product })
  }

  const handleAddPending = (ncId: string, file: File) => {
    const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const previewUrl = URL.createObjectURL(file)
    setPendingByNc((prev) => ({
      ...prev,
      [ncId]: [...(prev[ncId] ?? []), { localId, file, previewUrl }],
    }))
  }

  const handleRemovePending = (ncId: string, localId: string) => {
    setPendingByNc((prev) => {
      const list = prev[ncId] ?? []
      const target = list.find((p) => p.localId === localId)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return {
        ...prev,
        [ncId]: list.filter((p) => p.localId !== localId),
      }
    })
  }

  const handleMarkSavedDeleted = (ncId: string, photoId: string) => {
    setDeletedByNc((prev) => ({
      ...prev,
      [ncId]: [...new Set([...(prev[ncId] ?? []), photoId])],
    }))
  }

  const openFullscreen = () => {
    if (editing) {
      clearPendingPhotos()
      setDraft(cloneItems(items))
      setEditing(false)
    }
    setFullscreen(true)
  }

  const periodHint = periodLabel ? ` · ${periodLabel}` : ''
  const description = cloudSync
    ? syncReady
      ? `고객사에서 발생한 부적합·조치 현황${periodHint}`
      : `고객사에서 발생한 부적합·조치 현황 · 공유 데이터 불러오는 중…${periodHint}`
    : `고객사에서 발생한 부적합·조치 현황${periodHint}`

  const editActions = editing && canEdit ? (
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
        disabled={saving || photoCommitting}
        className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        {photoCommitting || saving ? '저장 중…' : '저장'}
      </button>
    </>
  ) : (
    <button
      type="button"
      onClick={startEdit}
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
      title={canEdit ? '편집' : '관리자 로그인 후 편집'}
    >
      {canEdit ? <Pencil size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
      편집
    </button>
  )

  const tableProps = {
    items,
    photoUrls,
    ncPhotosMap,
    pendingByNc,
    deletedByNc,
    editing,
    canEdit,
    draft,
    productOptions,
    onUpdate: updateItem,
    onRemove: removeItem,
    onProductChange: handleProductChange,
    onAddPending: handleAddPending,
    onRemovePending: handleRemovePending,
    onMarkSavedDeleted: handleMarkSavedDeleted,
  }

  const panelBody =
    editing && canEdit ? (
      <div className="space-y-3">
        <CustomerNcTable {...tableProps} />
        <button
          type="button"
          onClick={addItem}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm text-muted transition hover:border-accent hover:text-accent"
        >
          <Plus size={14} />
          행 추가
        </button>
      </div>
    ) : items.length ? (
      <CustomerNcTable {...tableProps} />
    ) : (
      <p className="text-sm text-muted">등록된 고객사 부적합 현황이 없습니다.</p>
    )

  const fullscreenBody = items.length ? (
    <div className="mx-auto w-full max-w-6xl rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
      <CustomerNcTable
        {...tableProps}
        editing={false}
        canEdit={false}
      />
    </div>
  ) : (
    <div className="mx-auto flex w-full max-w-4xl items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-16">
      <p className="text-base text-muted sm:text-lg">
        등록된 고객사 부적합 현황이 없습니다.
      </p>
    </div>
  )

  return (
    <>
      <Panel
        title="1. 고객사 부적합 현황"
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
        title="1. 고객사 부적합 현황"
        description={description}
        onClose={() => setFullscreen(false)}
      >
        {fullscreenBody}
      </WeeklyFullscreenOverlay>
    </>
  )
}
