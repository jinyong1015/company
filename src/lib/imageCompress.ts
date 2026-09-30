import imageCompression from 'browser-image-compression'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024

export function validateImageFile(file: File): string | null {
  if (!file) return '이미지 파일을 선택해 주세요.'
  if (file.size > MAX_ORIGINAL_BYTES) {
    return '파일 용량이 너무 큽니다. 20MB 이하 이미지만 업로드할 수 있습니다.'
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mimeOk = ALLOWED_MIME.has(file.type) || file.type === ''
  const extOk = ALLOWED_EXT.has(ext)
  if (!mimeOk && !extOk) {
    return 'JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.'
  }
  if (!extOk && mimeOk) {
    // MIME만 맞고 확장자가 이상한 경우는 허용하되 압축 단계에서 처리
  } else if (!extOk) {
    return 'JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.'
  }
  return null
}

/** 긴 변 1920px, quality ~0.8, EXIF orientation 반영. 결과가 원본보다 크면 더 작은 쪽 사용. */
export async function compressInspectionImage(file: File): Promise<File> {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: 1920,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: 'image/jpeg',
    preserveExif: false,
  })

  const out =
    compressed.size < file.size
      ? compressed
      : file.type === 'image/jpeg' || file.type === 'image/jpg'
        ? file
        : compressed

  const nameBase = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([out], `${nameBase}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
