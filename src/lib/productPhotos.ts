import { getSupabase, isCloudSyncEnabled } from './supabase'
import { compressInspectionImage, validateImageFile } from './imageCompress'

export const PRODUCT_PHOTOS_BUCKET = 'product-photos'

export type ProductPhotoRow = {
  id: string
  product_key: string
  file_path: string
  file_name: string
  created_at: string
  updated_at: string
}

export type ProductPhotoView = ProductPhotoRow & {
  url: string | null
}

const UPLOAD_FAIL = '사진을 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const DELETE_FAIL = '사진을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const SIGNED_URL_SECONDS = 60 * 60

function requireClient() {
  const supabase = getSupabase()
  if (!supabase || !isCloudSyncEnabled()) {
    throw new Error('클라우드 저장소에 연결할 수 없습니다. Supabase 설정을 확인해 주세요.')
  }
  return supabase
}

function storagePath(productKey: string) {
  const folder = encodeURIComponent(productKey.trim())
  return `${folder}/${Date.now()}.jpg`
}

export async function getProductPhoto(
  productKey: string,
): Promise<ProductPhotoView | null> {
  const key = productKey.trim()
  if (!key) return null
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('product_photos')
    .select('id, product_key, file_path, file_name, created_at, updated_at')
    .eq('product_key', key)
    .maybeSingle()

  if (error) {
    console.warn('[product-photos] fetch failed', error.message)
    return null
  }
  if (!data) return null

  const url = await createSignedPhotoUrl(data.file_path)
  return { ...data, url }
}

export async function createSignedPhotoUrl(
  filePath: string,
): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase || !filePath) return null
  const { data, error } = await supabase.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_SECONDS)
  if (error) {
    console.warn('[product-photos] signed url failed', error.message)
    return null
  }
  return data.signedUrl
}

/** 여러 품번의 제품 사진 Signed URL을 한 번에 조회 */
export async function getProductPhotoUrlMap(
  productKeys: string[],
): Promise<Record<string, string>> {
  const keys = [...new Set(productKeys.map((k) => k.trim()).filter(Boolean))]
  if (!keys.length) return {}
  const supabase = getSupabase()
  if (!supabase) return {}

  const { data, error } = await supabase
    .from('product_photos')
    .select('product_key, file_path')
    .in('product_key', keys)

  if (error) {
    console.warn('[product-photos] batch fetch failed', error.message)
    return {}
  }
  if (!data?.length) return {}

  const entries = await Promise.all(
    data.map(async (row) => {
      const url = await createSignedPhotoUrl(row.file_path)
      return url ? ([row.product_key, url] as const) : null
    }),
  )

  const map: Record<string, string> = {}
  for (const entry of entries) {
    if (entry) map[entry[0]] = entry[1]
  }
  return map
}

async function removeStorageObject(filePath: string) {
  if (!filePath) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .remove([filePath])
  if (error) {
    console.warn('[product-photos] storage remove failed', error.message)
  }
}

/**
 * 새 사진 업로드 또는 기존 사진 교체.
 * 새 Storage 업로드 → DB upsert 성공 후 기존 Storage 삭제.
 */
export async function saveProductPhoto(
  productKey: string,
  file: File,
  onStatus?: (status: 'compressing' | 'uploading') => void,
): Promise<{ ok: true; photo: ProductPhotoView } | { ok: false; error: string }> {
  const key = productKey.trim()
  if (!key) {
    return { ok: false, error: '품번 정보가 없습니다.' }
  }

  const validation = validateImageFile(file)
  if (validation) return { ok: false, error: validation }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : UPLOAD_FAIL }
  }

  const { data: existing } = await supabase
    .from('product_photos')
    .select('id, file_path')
    .eq('product_key', key)
    .maybeSingle()

  const previousPath = existing?.file_path ?? null
  const nextPath = storagePath(key)

  let compressed: File
  try {
    onStatus?.('compressing')
    compressed = await compressInspectionImage(file)
  } catch (e) {
    console.warn('[product-photos] compress failed', e)
    return { ok: false, error: UPLOAD_FAIL }
  }

  onStatus?.('uploading')
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .upload(nextPath, compressed, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    })

  if (uploadError) {
    console.warn('[product-photos] upload failed', uploadError.message)
    return { ok: false, error: UPLOAD_FAIL }
  }

  const now = new Date().toISOString()
  const { data: row, error: dbError } = await supabase
    .from('product_photos')
    .upsert(
      {
        product_key: key,
        file_path: nextPath,
        file_name: file.name,
        updated_at: now,
        ...(existing?.id ? { id: existing.id } : {}),
      },
      { onConflict: 'product_key' },
    )
    .select('id, product_key, file_path, file_name, created_at, updated_at')
    .single()

  if (dbError || !row) {
    console.warn('[product-photos] db upsert failed', dbError?.message)
    await removeStorageObject(nextPath)
    return { ok: false, error: UPLOAD_FAIL }
  }

  if (previousPath && previousPath !== nextPath) {
    await removeStorageObject(previousPath)
  }

  const url = await createSignedPhotoUrl(row.file_path)
  return { ok: true, photo: { ...row, url } }
}

export async function deleteProductPhoto(
  productKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = productKey.trim()
  if (!key) return { ok: false, error: '품번 정보가 없습니다.' }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DELETE_FAIL }
  }

  const { data: existing, error: fetchError } = await supabase
    .from('product_photos')
    .select('id, file_path')
    .eq('product_key', key)
    .maybeSingle()

  if (fetchError) {
    console.warn('[product-photos] delete fetch failed', fetchError.message)
    return { ok: false, error: DELETE_FAIL }
  }
  if (!existing) return { ok: true }

  const { error: storageError } = await supabase.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .remove([existing.file_path])

  if (storageError) {
    console.warn('[product-photos] delete storage failed', storageError.message)
    return { ok: false, error: DELETE_FAIL }
  }

  const { error: dbError } = await supabase
    .from('product_photos')
    .delete()
    .eq('product_key', key)

  if (dbError) {
    console.warn('[product-photos] delete db failed', dbError.message)
    return { ok: false, error: DELETE_FAIL }
  }

  return { ok: true }
}
