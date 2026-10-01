import { getSupabase, isCloudSyncEnabled } from './supabase'
import { compressInspectionImage, validateImageFile } from './imageCompress'

/** Storage 버킷명 */
export const NONCONFORMITY_IMAGES_BUCKET = 'nonconformity-images'

/**
 * Storage object key는 ASCII만 허용됨 (한글 → Invalid key).
 * 논리 구조: 부적합/{품번}/부적합사진/{uuid}.jpg
 * 실제 키:   nonconformity/{품번}/photos/{uuid}.jpg
 */
const FOLDER_ROOT = 'nonconformity'
const FOLDER_PHOTOS = 'photos'
const SIGNED_URL_SECONDS = 60 * 60

const SELECT_COLS =
  'id, period_key, nonconformity_id, item_code, storage_path, file_name, file_size, mime_type, is_thumbnail, created_at'

export type NonconformityPhotoRow = {
  id: string
  period_key: string
  nonconformity_id: string
  item_code: string
  storage_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  is_thumbnail: boolean
  created_at: string
}

export type NonconformityPhotoView = NonconformityPhotoRow & {
  url: string | null
}

const UPLOAD_FAIL = '부적합 사진을 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const DELETE_FAIL = '부적합 사진을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const MOVE_FAIL = '품번 변경에 따른 사진 이동에 실패했습니다. 잠시 후 다시 시도해 주세요.'

function requireClient() {
  const supabase = getSupabase()
  if (!supabase || !isCloudSyncEnabled()) {
    throw new Error(
      '클라우드 저장소에 연결할 수 없습니다. Supabase 설정을 확인해 주세요.',
    )
  }
  return supabase
}

/** Storage 경로에 쓸 품번 — `/` `\` 및 비-ASCII 제거 */
export function sanitizeItemCode(itemCode: string): string {
  return itemCode
    .trim()
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
}

/**
 * Storage 실제 키: nonconformity/{품번}/photos/{uuid}.jpg
 * (Supabase는 한글 경로를 Invalid key로 거절함)
 */
export function buildNonconformityStoragePath(
  itemCode: string,
  fileId: string,
  ext = 'jpg',
): string {
  const code = sanitizeItemCode(itemCode)
  if (!code) throw new Error('품번이 없습니다.')
  const id = (fileId.trim() || crypto.randomUUID()).replace(
    /[^a-zA-Z0-9\-]/g,
    '',
  )
  const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'jpg'
  return `${FOLDER_ROOT}/${code}/${FOLDER_PHOTOS}/${id}.${safeExt}`
}

export async function createNonconformitySignedUrl(
  storagePath: string,
): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase || !storagePath) return null
  const { data, error } = await supabase.storage
    .from(NONCONFORMITY_IMAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS)
  if (error) {
    console.warn('[nc-photos] signed url failed', error.message)
    return null
  }
  return data.signedUrl
}

async function withSignedUrls(
  rows: NonconformityPhotoRow[],
): Promise<NonconformityPhotoView[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await createNonconformitySignedUrl(row.storage_path),
    })),
  )
}

/**
 * 주간 ISSUE와 동일: period_key + 행 ID로 조회.
 */
export async function listNonconformityPhotos(
  nonconformityId: string,
  periodKey: string,
): Promise<NonconformityPhotoView[]> {
  const id = nonconformityId.trim()
  const key = periodKey.trim()
  if (!id || !key) return []
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('nonconformity_photos')
    .select(SELECT_COLS)
    .eq('period_key', key)
    .eq('nonconformity_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[nc-photos] list failed', error.message)
    return []
  }
  if (!data?.length) return []
  return withSignedUrls(data as NonconformityPhotoRow[])
}

/** 여러 부적합 행의 사진을 period_key 범위에서 한 번에 조회 */
export async function listNonconformityPhotosByIds(
  nonconformityIds: string[],
  periodKey: string,
): Promise<Record<string, NonconformityPhotoView[]>> {
  const ids = [...new Set(nonconformityIds.map((i) => i.trim()).filter(Boolean))]
  const key = periodKey.trim()
  if (!ids.length || !key) return {}
  const supabase = getSupabase()
  if (!supabase) return {}

  const { data, error } = await supabase
    .from('nonconformity_photos')
    .select(SELECT_COLS)
    .eq('period_key', key)
    .in('nonconformity_id', ids)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[nc-photos] batch list failed', error.message)
    return {}
  }
  if (!data?.length) return {}

  const withUrls = await withSignedUrls(data as NonconformityPhotoRow[])
  const map: Record<string, NonconformityPhotoView[]> = {}
  for (const photo of withUrls) {
    if (!map[photo.nonconformity_id]) map[photo.nonconformity_id] = []
    map[photo.nonconformity_id].push(photo)
  }
  return map
}

/** 스냅샷 저장용 — signed URL 없이 메타만 (행 id → 사진 목록) */
export async function listNonconformityPhotoRowsByIds(
  nonconformityIds: string[],
  periodKey: string,
): Promise<Record<string, NonconformityPhotoRow[]>> {
  const ids = [...new Set(nonconformityIds.map((i) => i.trim()).filter(Boolean))]
  const key = periodKey.trim()
  if (!ids.length || !key) return {}
  const supabase = getSupabase()
  if (!supabase) return {}

  const { data, error } = await supabase
    .from('nonconformity_photos')
    .select(SELECT_COLS)
    .eq('period_key', key)
    .in('nonconformity_id', ids)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[nc-photos] batch list (rows) failed', error.message)
    return {}
  }
  if (!data?.length) return {}

  const map: Record<string, NonconformityPhotoRow[]> = {}
  for (const row of data as NonconformityPhotoRow[]) {
    if (!map[row.nonconformity_id]) map[row.nonconformity_id] = []
    map[row.nonconformity_id].push(row)
  }
  return map
}

/** 스냅샷에 동결된 사진 메타에 signed URL을 붙여 표시용으로 변환 */
export async function hydrateNonconformityPhotoRows(
  byNcId: Record<string, NonconformityPhotoRow[]>,
): Promise<Record<string, NonconformityPhotoView[]>> {
  const entries = Object.entries(byNcId)
  if (!entries.length) return {}
  const result: Record<string, NonconformityPhotoView[]> = {}
  await Promise.all(
    entries.map(async ([ncId, rows]) => {
      result[ncId] = await withSignedUrls(rows)
    }),
  )
  return result
}

async function removeStorageObject(storagePath: string) {
  if (!storagePath) return
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.storage
    .from(NONCONFORMITY_IMAGES_BUCKET)
    .remove([storagePath])
  if (error) {
    console.warn('[nc-photos] storage remove failed', error.message)
  }
}

async function deletePhotoRows(
  rows: { id: string; storage_path: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!rows.length) return { ok: true }
  const supabase = requireClient()
  const ids = rows.map((r) => r.id)
  const paths = rows.map((r) => r.storage_path).filter(Boolean)

  // DB 행을 먼저 지운다. Storage는 best-effort — 파일 없음/권한 오류로 DB 삭제가 막히지 않게.
  const { error: dbError } = await supabase
    .from('nonconformity_photos')
    .delete()
    .in('id', ids)
  if (dbError) {
    console.warn('[nc-photos] db batch delete failed', dbError.message)
    return { ok: false, error: `${DELETE_FAIL} (${dbError.message})` }
  }

  if (paths.length) {
    const { error: storageError } = await supabase.storage
      .from(NONCONFORMITY_IMAGES_BUCKET)
      .remove(paths)
    if (storageError) {
      console.warn(
        '[nc-photos] storage batch remove failed (DB row already deleted)',
        storageError.message,
      )
    }
  }
  return { ok: true }
}

/**
 * 품번 선택 후 사진 업로드.
 * DB에는 주간 ISSUE와 동일하게 period_key를 함께 저장.
 */
export async function uploadNonconformityPhoto(
  periodKey: string,
  nonconformityId: string,
  itemCode: string,
  file: File,
  onStatus?: (status: 'compressing' | 'uploading') => void,
): Promise<
  { ok: true; photo: NonconformityPhotoView } | { ok: false; error: string }
> {
  const key = periodKey.trim()
  const ncId = nonconformityId.trim()
  const code = sanitizeItemCode(itemCode)
  if (!key) return { ok: false, error: '조회 기간 키가 없습니다.' }
  if (!ncId) return { ok: false, error: '부적합 항목 ID가 없습니다.' }
  if (!code) return { ok: false, error: '품번을 먼저 선택해 주세요.' }

  const validation = validateImageFile(file)
  if (validation) return { ok: false, error: validation }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : UPLOAD_FAIL }
  }

  let compressed: File
  try {
    onStatus?.('compressing')
    compressed = await compressInspectionImage(file)
  } catch (e) {
    console.warn('[nc-photos] compress failed', e)
    return {
      ok: false,
      error: '이미지 압축에 실패했습니다. 다른 파일로 다시 시도해 주세요.',
    }
  }

  const fileId = crypto.randomUUID()
  let storagePath: string
  try {
    storagePath = buildNonconformityStoragePath(code, fileId, 'jpg')
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : UPLOAD_FAIL }
  }

  onStatus?.('uploading')
  const { error: uploadError } = await supabase.storage
    .from(NONCONFORMITY_IMAGES_BUCKET)
    .upload(storagePath, compressed, {
      contentType: compressed.type || 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    })

  if (uploadError) {
    console.warn('[nc-photos] upload failed', uploadError.message)
    const hint = /bucket|not found/i.test(uploadError.message)
      ? ' Storage 버킷(nonconformity-images)이 없습니다. supabase/nonconformity_photos.sql 을 SQL Editor에서 실행해 주세요.'
      : ` (${uploadError.message})`
    return { ok: false, error: `${UPLOAD_FAIL}${hint}` }
  }

  const { count, error: countError } = await supabase
    .from('nonconformity_photos')
    .select('id', { count: 'exact', head: true })
    .eq('period_key', key)
    .eq('nonconformity_id', ncId)

  if (countError) {
    console.warn('[nc-photos] count failed', countError.message)
    // period_key 컬럼 없음 등 — 계속 insert 시도하되 메시지를 남긴다
  }

  const isThumbnail = (count ?? 0) === 0

  const { data: row, error: dbError } = await supabase
    .from('nonconformity_photos')
    .insert({
      period_key: key,
      nonconformity_id: ncId,
      item_code: code,
      storage_path: storagePath,
      file_name: file.name,
      file_size: compressed.size,
      mime_type: compressed.type || 'image/jpeg',
      is_thumbnail: isThumbnail,
    })
    .select(SELECT_COLS)
    .single()

  if (dbError || !row) {
    console.warn('[nc-photos] db insert failed', dbError?.message)
    await removeStorageObject(storagePath)
    const msg = dbError?.message ?? '행을 읽을 수 없습니다.'
    const hint = /period_key|column/i.test(msg)
      ? ' DB에 period_key 컬럼이 없습니다. supabase/nonconformity_photos.sql 을 SQL Editor에서 다시 실행해 주세요.'
      : /schema cache/i.test(msg)
        ? ' Supabase 대시보드에서 API를 잠시 기다린 뒤 다시 시도하거나 SQL을 재실행해 주세요.'
        : ` (${msg})`
    return { ok: false, error: `${UPLOAD_FAIL}${hint}` }
  }

  const url = await createNonconformitySignedUrl(row.storage_path)
  return { ok: true, photo: { ...(row as NonconformityPhotoRow), url } }
}

export async function deleteNonconformityPhoto(
  photoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = photoId.trim()
  if (!id) return { ok: false, error: '사진 ID가 없습니다.' }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DELETE_FAIL }
  }

  const { data: existing, error: fetchError } = await supabase
    .from('nonconformity_photos')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    console.warn('[nc-photos] delete fetch failed', fetchError.message)
    return { ok: false, error: DELETE_FAIL }
  }
  if (!existing) return { ok: true }

  return deletePhotoRows([existing])
}

/** 부적합 행 삭제 시 — 해당 period_key + 행 ID 사진 전부 제거 */
export async function deleteAllNonconformityPhotos(
  nonconformityId: string,
  periodKey?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ncId = nonconformityId.trim()
  if (!ncId) return { ok: true }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DELETE_FAIL }
  }

  let query = supabase
    .from('nonconformity_photos')
    .select('id, storage_path')
    .eq('nonconformity_id', ncId)
  const key = periodKey?.trim()
  if (key) query = query.eq('period_key', key)

  const { data: rows, error: fetchError } = await query
  if (fetchError) {
    console.warn('[nc-photos] delete-all fetch failed', fetchError.message)
    return { ok: false, error: DELETE_FAIL }
  }
  return deletePhotoRows(rows ?? [])
}

/**
 * 주간 ISSUE 빈 저장과 동일: 해당 period_key의 사진 전부 삭제.
 */
export async function deleteNonconformityPhotosByPeriodKey(
  periodKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = periodKey.trim()
  if (!key) return { ok: true }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DELETE_FAIL }
  }

  const { data: rows, error: fetchError } = await supabase
    .from('nonconformity_photos')
    .select('id, storage_path')
    .eq('period_key', key)

  if (fetchError) {
    console.warn('[nc-photos] delete-by-period fetch failed', fetchError.message)
    return { ok: false, error: DELETE_FAIL }
  }
  return deletePhotoRows(rows ?? [])
}

/**
 * 현황 저장 후 — 해당 period_key에서 남은 행 ID만 유지, 나머지 사진 삭제.
 * (주간 ISSUE가 period_key 단위로 덮어쓰는 것과 맞춤)
 */
export async function pruneNonconformityPhotosForPeriod(
  periodKey: string,
  keepNonconformityIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = periodKey.trim()
  if (!key) return { ok: true }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DELETE_FAIL }
  }

  const keep = new Set(
    keepNonconformityIds.map((id) => id.trim()).filter(Boolean),
  )

  const { data: rows, error: fetchError } = await supabase
    .from('nonconformity_photos')
    .select('id, storage_path, nonconformity_id')
    .eq('period_key', key)

  if (fetchError) {
    console.warn('[nc-photos] prune fetch failed', fetchError.message)
    return { ok: false, error: DELETE_FAIL }
  }
  if (!rows?.length) return { ok: true }

  const toDelete = rows.filter((r) => !keep.has(r.nonconformity_id))
  return deletePhotoRows(toDelete)
}

/**
 * 품번 변경 시: Storage move + DB item_code·storage_path 갱신 (period_key 유지).
 */
export async function moveNonconformityPhotosToItemCode(
  nonconformityId: string,
  nextItemCode: string,
  periodKey?: string,
): Promise<{ ok: true; photos: NonconformityPhotoView[] } | { ok: false; error: string }> {
  const ncId = nonconformityId.trim()
  const nextCode = sanitizeItemCode(nextItemCode)
  if (!ncId) return { ok: false, error: '부적합 항목 ID가 없습니다.' }
  if (!nextCode) return { ok: false, error: '변경할 품번이 없습니다.' }

  let supabase
  try {
    supabase = requireClient()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : MOVE_FAIL }
  }

  let query = supabase
    .from('nonconformity_photos')
    .select(SELECT_COLS)
    .eq('nonconformity_id', ncId)
    .order('created_at', { ascending: true })
  const key = periodKey?.trim()
  if (key) query = query.eq('period_key', key)

  const { data: rows, error: fetchError } = await query
  if (fetchError) {
    console.warn('[nc-photos] move fetch failed', fetchError.message)
    return { ok: false, error: MOVE_FAIL }
  }
  if (!rows?.length) {
    return { ok: true, photos: [] }
  }

  const updated: NonconformityPhotoView[] = []

  for (const row of rows as NonconformityPhotoRow[]) {
    if (sanitizeItemCode(row.item_code) === nextCode) {
      updated.push({
        ...row,
        url: await createNonconformitySignedUrl(row.storage_path),
      })
      continue
    }

    const ext =
      row.storage_path.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      'jpg'
    const fileId = crypto.randomUUID()
    const nextPath = buildNonconformityStoragePath(nextCode, fileId, ext)

    const { error: moveError } = await supabase.storage
      .from(NONCONFORMITY_IMAGES_BUCKET)
      .move(row.storage_path, nextPath)

    if (moveError) {
      console.warn('[nc-photos] storage move failed', moveError.message)
      return { ok: false, error: MOVE_FAIL }
    }

    const { data: saved, error: dbError } = await supabase
      .from('nonconformity_photos')
      .update({
        item_code: nextCode,
        storage_path: nextPath,
      })
      .eq('id', row.id)
      .select(SELECT_COLS)
      .single()

    if (dbError || !saved) {
      console.warn('[nc-photos] move db update failed', dbError?.message)
      await supabase.storage
        .from(NONCONFORMITY_IMAGES_BUCKET)
        .move(nextPath, row.storage_path)
      return { ok: false, error: MOVE_FAIL }
    }

    updated.push({
      ...(saved as NonconformityPhotoRow),
      url: await createNonconformitySignedUrl(saved.storage_path),
    })
  }

  return { ok: true, photos: updated }
}
