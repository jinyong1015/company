import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { validateImageFile } from '../../lib/imageCompress'
import type { NonconformityPhotoView } from '../../lib/nonconformityPhotos'
import { isCloudSyncEnabled } from '../../lib/supabase'

const thumbClass =
  'relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas sm:h-52 sm:w-52 md:h-60 md:w-60 lg:h-64 lg:w-64'

export type PendingNcPhoto = {
  localId: string
  file: File
  previewUrl: string
}

/**
 * 부적합 사진 갤러리.
 * 새 사진·삭제는 편집 중 로컬만 반영하고, 현황 「저장」 시에 DB/Storage에 반영된다.
 */
export function CustomerNcPhotos({
  itemCode,
  canEdit,
  orderLabel,
  savedPhotos = [],
  pendingPhotos = [],
  deletedPhotoIds = [],
  onAddPending,
  onRemovePending,
  onMarkSavedDeleted,
}: {
  itemCode?: string
  canEdit: boolean
  orderLabel?: string
  savedPhotos?: NonconformityPhotoView[]
  pendingPhotos?: PendingNcPhoto[]
  /** 저장 시 DB에서 지울 이미 저장된 사진 id */
  deletedPhotoIds?: string[]
  onAddPending?: (file: File) => void
  onRemovePending?: (localId: string) => void
  onMarkSavedDeleted?: (photoId: string) => void
}) {
  const { pushToast } = useToast()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxAlt, setLightboxAlt] = useState('')

  const code = itemCode?.trim() ?? ''
  const cloudOff = !isCloudSyncEnabled()
  const deletedSet = new Set(deletedPhotoIds)
  const visibleSaved = savedPhotos.filter((p) => !deletedSet.has(p.id))

  useEffect(() => {
    if (!lightboxUrl) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxUrl])

  const onFileSelect = (file: File | null) => {
    if (!file || !canEdit) {
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (!code) {
      pushToast('품번을 먼저 선택해 주세요.', 'info')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    const err = validateImageFile(file)
    if (err) {
      pushToast(err, 'error')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    onAddPending?.(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  const openLightbox = (url: string, alt: string) => {
    setLightboxUrl(url)
    setLightboxAlt(alt)
  }

  const showEmptyHint =
    canEdit && !visibleSaved.length && !pendingPhotos.length

  if (cloudOff) {
    if (!canEdit) return null
    return (
      <p className="text-xs text-muted">
        클라우드 미설정 — 부적합 사진을 사용할 수 없습니다.
      </p>
    )
  }

  if (!canEdit && !visibleSaved.length) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {orderLabel ? (
          <span className="text-sm font-semibold text-ink">{orderLabel}</span>
        ) : null}
        {canEdit && code ? (
          <>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="sr-only"
              onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-sm transition hover:border-accent hover:text-accent"
            >
              <ImagePlus size={18} aria-hidden />
              사진 추가
            </label>
            <span className="text-xs text-muted">
              미리보기만 · 현황 저장 시 DB 반영
            </span>
          </>
        ) : null}
        {canEdit && !code ? (
          <span className="text-xs text-muted">부적합명에서 품번 추가 후 사진 추가</span>
        ) : null}
      </div>

      {visibleSaved.length || pendingPhotos.length ? (
        <ul className="flex flex-wrap gap-4 sm:gap-5">
          {visibleSaved.map((photo) => (
            <li key={photo.id} className={thumbClass}>
              {photo.url ? (
                <button
                  type="button"
                  className="flex h-full w-full items-center justify-center p-1"
                  onClick={() => openLightbox(photo.url!, photo.file_name)}
                  title="크게 보기"
                >
                  <img
                    src={photo.url}
                    alt={photo.file_name}
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                </button>
              ) : (
                <ImagePlus className="h-8 w-8 text-muted/50" aria-hidden />
              )}
              {canEdit ? (
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded bg-white/95 p-1 text-muted shadow hover:text-danger"
                  aria-label="사진 삭제"
                  title="삭제(저장 시 반영)"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!window.confirm('이 부적합 사진을 삭제할까요? (현황 저장 시 반영)')) {
                      return
                    }
                    onMarkSavedDeleted?.(photo.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}

          {pendingPhotos.map((pending) => (
            <li
              key={pending.localId}
              className={`${thumbClass} ring-2 ring-accent ring-offset-1`}
              title="저장 전 미리보기"
            >
              <button
                type="button"
                className="flex h-full w-full items-center justify-center p-1"
                onClick={() =>
                  openLightbox(pending.previewUrl, pending.file.name)
                }
                title="미리보기 크게 보기"
              >
                <img
                  src={pending.previewUrl}
                  alt={`미리보기 ${pending.file.name}`}
                  className="max-h-full max-w-full object-contain"
                />
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                미리보기
              </span>
              {canEdit ? (
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded bg-white/95 p-1 text-muted shadow hover:text-danger"
                  aria-label="미리보기 제거"
                  title="미리보기 제거"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemovePending?.(pending.localId)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : showEmptyHint ? (
        <p className="text-xs text-muted">등록된 부적합 사진 없음</p>
      ) : null}

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="사진 미리보기"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/30 bg-white/95 p-2 text-ink shadow"
            aria-label="닫기"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={18} />
          </button>
          <img
            src={lightboxUrl}
            alt={lightboxAlt}
            className="max-h-[90vh] max-w-[min(96vw,960px)] object-contain shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  )
}
