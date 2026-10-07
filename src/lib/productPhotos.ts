import { getSupabase, isCloudSyncEnabled } from './supabase'
import { compressInspectionImage, validateImageFile } from './imageCompress'
import { itemMatchKey, preferDisplayItem } from './itemMatchKey'

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

type PhotoRowLite = {
  id?: string
  product_key: string
  file_path: string
  file_name?: string
  created_at?: string
  updated_at?: string
}

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

/**
 * 요청 품번과 동일 matchKey인 기존 product_photos 행을 찾는다.
 * 복사하지 않고 기존 product_key 행에 연결한다.
 */
function resolvePhotoRow<T extends PhotoRowLite>(
  rows: T[],
  productKey: string,
): T | null {
  const key = productKey.trim()
  if (!key || !rows.length) return null

  // 1) 정확한 품번 일치
  const exact = rows.find((r) => r.product_key === key)
  if (exact) return exact

  // 2) 정규화·공백/하이픈 무시 — 동일 matchKey만 (다른 품번 사진 금지)
  const mk = itemMatchKey(key)
  if (!mk) return null
  const sameKey = rows.filter((r) => itemMatchKey(r.product_key) === mk)
  if (!sameKey.length) return null
  if (sameKey.length === 1) return sameKey[0]!
  const preferred = preferDisplayItem(sameKey.map((r) => r.product_key))
  return sameKey.find((r) => r.product_key === preferred) ?? sameKey[0]!
}

async function fetchAllPhotoRows(): Promise<PhotoRowLite[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('product_photos')
    .select('id, product_key, file_path, file_name, created_at, updated_at')
  if (error) {
    console.warn('[product-photos] list failed', error.message)
    return []
  }
  return data ?? []
}

export async function getProductPhoto(
  productKey: string,
): Promise<ProductPhotoView | null> {
  const key = productKey.trim()
  if (!key) return null
  const supabase = getSupabase()
  if (!supabase) return null

  // 1) 정확 일치
  const { data: exact, error } = await supabase
    .from('product_photos')
    .select('id, product_key, file_path, file_name, created_at, updated_at')
    .eq('product_key', key)
    .maybeSingle()

  if (error) {
    console.warn('[product-photos] fetch failed', error.message)
    return null
  }

  let row = exact
  // 2) itemMatchKey로 기존 품번 사진 연결 (YF9820 ↔ YF 9820)
  if (!row) {
    row = resolvePhotoRow(await fetchAllPhotoRows(), key) as ProductPhotoRow | null
  }
  if (!row) return null

  const url = await createSignedPhotoUrl(row.file_path)
  return { ...(row as ProductPhotoRow), url }
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

/**
 * 여러 품번의 제품 사진 Signed URL을 한 번에 조회.
 * 반환 맵의 키는 **요청한 품번 문자열**(화면 표시값)이며,
 * DB product_key와 표기가 달라도 itemMatchKey로 연결한다.
 */
export async function getProductPhotoUrlMap(
  productKeys: string[],
): Promise<Record<string, string>> {
  const keys = [...new Set(productKeys.map((k) => k.trim()).filter(Boolean))]
  if (!keys.length) return {}
  const supabase = getSupabase()
  if (!supabase) return {}

  const rows = await fetchAllPhotoRows()
  if (!rows.length) return {}

  const map: Record<string, string> = {}
  const urlByPath = new Map<string, string | null>()

  for (const key of keys) {
    const row = resolvePhotoRow(rows, key)
    if (!row) continue
    let url = urlByPath.get(row.file_path)
    if (url === undefined) {
      url = await createSignedPhotoUrl(row.file_path)
      urlByPath.set(row.file_path, url)
    }
    if (url) map[key] = url
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
 * matchKey가 같은 기존 product_key가 있으면 그 키에 upsert(복사 없이 연결).
 */
export async function saveProductPhoto(
  productKey: string,
  file: File,
  onStatus?: (status: 'compressing' | 'uploading') => void,
): Promise<{ ok: true; photo: ProductPhotoView } | { ok: false; error: string }> {
  const requested = productKey.trim()
  if (!requested) {
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

  const allRows = await fetchAllPhotoRows()
  const matched = resolvePhotoRow(allRows, requested)
  // 기존 행이 있으면 그 product_key에 연결, 없으면 요청 표기 그대로 신규
  const key = matched?.product_key ?? requested

  const previousPath = matched?.file_path ?? null
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
        ...(matched?.id ? { id: matched.id } : {}),
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
  const requested = productKey.trim()
  if (!requested) return { ok: false, error: '품번 정보가 없습니다.' }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DELETE_FAIL }
  }

  const matched = resolvePhotoRow(await fetchAllPhotoRows(), requested)
  if (!matched) return { ok: true }

  const key = matched.product_key

  const { error: storageError } = await supabase.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .remove([matched.file_path])

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
