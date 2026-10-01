import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { Panel } from '../common/Panel'
import { useAdmin } from '../../context/AdminContext'
import { useToast } from '../../context/ToastContext'
import {
  deleteProductPhoto,
  getProductPhoto,
  saveProductPhoto,
  type ProductPhotoView,
} from '../../lib/productPhotos'
import { validateImageFile } from '../../lib/imageCompress'
import { isCloudSyncEnabled } from '../../lib/supabase'

type Status = 'idle' | 'loading' | 'compressing' | 'uploading'

export function ProductPhotoPanel({ productKey }: { productKey: string }) {
  const { canUploadProductPhoto, canDeleteProductPhoto, openLogin } = useAdmin()
  const { pushToast } = useToast()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<ProductPhotoView | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setPhoto(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPendingFile(null)

    if (!productKey.trim() || !isCloudSyncEnabled()) {
      setStatus('idle')
      return
    }

    void getProductPhoto(productKey).then((row) => {
      if (cancelled) return
      setPhoto(row)
      setStatus('idle')
    })

    return () => {
      cancelled = true
    }
  }, [productKey])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const clearPending = () => {
    setPendingFile(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    if (inputRef.current) inputRef.current.value = ''
  }

  const onFileChange = (file: File | null) => {
    if (!file) {
      clearPending()
      return
    }
    const err = validateImageFile(file)
    if (err) {
      pushToast(err, 'error')
      clearPending()
      return
    }
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setPendingFile(file)
  }

  const onUpload = async () => {
    if (!pendingFile || !canUploadProductPhoto) {
      if (!canUploadProductPhoto) openLogin('manager')
      return
    }
    setStatus('compressing')
    const result = await saveProductPhoto(productKey, pendingFile, (s) =>
      setStatus(s),
    )
    if (!result.ok) {
      setStatus('idle')
      pushToast(result.error, 'error')
      return
    }
    clearPending()
    setPhoto(result.photo)
    setStatus('idle')
    pushToast('사진을 저장했습니다.', 'success')
  }

  const onDelete = async () => {
    if (!canDeleteProductPhoto) {
      openLogin('admin')
      pushToast('사진 삭제는 관리자만 가능합니다.', 'info')
      return
    }
    if (!photo) return
    if (!window.confirm('등록된 사진을 삭제하시겠습니까?')) return
    setStatus('uploading')
    const result = await deleteProductPhoto(productKey)
    if (!result.ok) {
      setStatus('idle')
      pushToast(result.error, 'error')
      return
    }
    clearPending()
    setPhoto(null)
    setStatus('idle')
    pushToast('사진을 삭제했습니다.', 'success')
  }

  const busy = status === 'compressing' || status === 'uploading'
  const displayUrl = previewUrl ?? photo?.url ?? null
  const hasSaved = Boolean(photo?.url)
  const cloudOff = !isCloudSyncEnabled()

  return (
    <Panel title="제품 사진">
      {cloudOff ? (
        <p className="text-sm text-muted">
          클라우드 저장소가 설정되지 않아 사진을 사용할 수 없습니다.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-canvas/50">
            {status === 'loading' ? (
              <p className="text-sm text-muted">사진 불러오는 중…</p>
            ) : displayUrl ? (
              <img
                src={displayUrl}
                alt={`${productKey} 제품 사진`}
                className="max-h-[360px] w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <ImagePlus className="h-8 w-8 text-muted/70" aria-hidden />
                <p className="text-sm text-muted">등록된 제품 사진이 없습니다.</p>
              </div>
            )}
          </div>

          {busy ? (
            <p className="text-sm text-accent" role="status">
              {status === 'compressing' ? '사진 압축 중…' : '업로드 중…'}
            </p>
          ) : null}

          {canUploadProductPhoto ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
              <label
                htmlFor={inputId}
                className={`btn inline-flex cursor-pointer items-center gap-1.5 text-sm ${
                  busy ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                <ImagePlus className="h-4 w-4" aria-hidden />
                {hasSaved || pendingFile ? '사진 변경' : '사진 업로드'}
              </label>

              {pendingFile ? (
                <button
                  type="button"
                  className="btn btn-primary inline-flex items-center gap-1.5 text-sm"
                  disabled={busy}
                  onClick={() => void onUpload()}
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  사진 업로드
                </button>
              ) : null}

              {hasSaved && !pendingFile && canDeleteProductPhoto ? (
                <button
                  type="button"
                  className="btn inline-flex items-center gap-1.5 text-sm text-danger"
                  disabled={busy}
                  onClick={() => void onDelete()}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  사진 삭제
                </button>
              ) : null}

              {pendingFile ? (
                <button
                  type="button"
                  className="text-sm text-muted hover:text-ink"
                  disabled={busy}
                  onClick={clearPending}
                >
                  선택 취소
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  )
}
