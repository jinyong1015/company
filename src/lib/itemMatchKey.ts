/**
 * 품번 매칭 KEY — 화면 표시용 품번과 분리.
 *
 * displayItem / normalizedItem: 화면에 보이는 품번 (공백·하이픈 유지)
 * itemMatchKey: 공백·하이픈 차이를 무시하는 비교용 KEY
 *
 * 예) "YF 9820" / "YF9820" → "YF9820"
 *     "GN7-N1060" / "GN7N1060" → "GN7N1060"
 *
 * 3차 교육: 원본을 바꾸지 않고 검색·연결만 한다.
 * 부분일치·유사 품번(숫자 1자리 차이)으로 임의 연결하지 않는다.
 */

/** 공백·하이픈 등 표기 차이를 제거한 매칭 KEY */
export function itemMatchKey(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u3000]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_./]+/g, '')
}

export function sameItemMatchKey(a: string, b: string): boolean {
  const ka = itemMatchKey(a)
  const kb = itemMatchKey(b)
  return Boolean(ka && kb && ka === kb)
}

/**
 * 동일 matchKey로 묶인 후보 중 표시용 품번을 고른다.
 * 공백·하이픈이 있는 시스템 표기를 우선한다.
 */
export function preferDisplayItem(candidates: Iterable<string>): string {
  const list = [
    ...new Set(
      [...candidates]
        .map((s) => s.normalize('NFKC').trim())
        .filter(Boolean),
    ),
  ]
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]!

  const scored = list.map((s) => {
    let score = 0
    if (/\s/.test(s)) score += 3
    if (/-/.test(s)) score += 2
    score += Math.min(s.length, 40) * 0.01
    return { s, score }
  })
  scored.sort(
    (a, b) =>
      b.score - a.score || a.s.localeCompare(b.s, 'ko'),
  )
  return scored[0]!.s
}

/** 목록에서 matchKey가 같은 품번을 찾는다. */
export function findByItemMatchKey(
  needle: string,
  haystack: Iterable<string>,
): string | null {
  const key = itemMatchKey(needle)
  if (!key) return null
  const hits = findAllByItemMatchKey(needle, haystack)
  if (!hits.length) return null
  return preferDisplayItem(hits)
}

/** 동일 matchKey 후보 전부 */
export function findAllByItemMatchKey(
  needle: string,
  haystack: Iterable<string>,
): string[] {
  const key = itemMatchKey(needle)
  if (!key) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of haystack) {
    const t = String(item ?? '').normalize('NFKC').trim()
    if (!t || itemMatchKey(t) !== key) continue
    const k = t.toUpperCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** 3차 교육 — 품번 매칭 상태 */
export type ItemMatchStatus =
  | 'MATCHED'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'INVALID'

export type ItemMatchResult = {
  status: ItemMatchStatus
  query: string
  originalItem: string
  /** 정규화 표시값(매핑 또는 원본) */
  normalizedItem: string
  matchKey: string
  /** MATCHED일 때 카탈로그에서 고른 표시 품번 */
  matchedItem: string | null
  /** 동일 matchKey 후보들 */
  candidates: string[]
}

/**
 * 카탈로그에 대한 정확 매칭 (부분일치 금지).
 * 1) 완전 일치 → 2) matchKey 일치 → 없으면 NOT_FOUND
 * 서로 다른 matchKey가 동시에 잡히면 AMBIGUOUS (정상 경로에선 드묾).
 */
export function matchItemAgainstCatalog(
  query: string,
  catalog: Iterable<string>,
  normalizedHint?: string | null,
): ItemMatchResult {
  const originalItem = query.normalize('NFKC').trim()
  if (!originalItem) {
    return {
      status: 'INVALID',
      query,
      originalItem: '',
      normalizedItem: '',
      matchKey: '',
      matchedItem: null,
      candidates: [],
    }
  }

  const normalizedItem = (normalizedHint ?? originalItem).normalize('NFKC').trim()
  const list = [
    ...new Set(
      [...catalog]
        .map((s) => String(s ?? '').normalize('NFKC').trim())
        .filter(Boolean),
    ),
  ]

  // 1순위 — 완전 일치
  const exact =
    list.find((p) => p === originalItem) ??
    list.find((p) => p === normalizedItem) ??
    list.find(
      (p) => p.toUpperCase() === originalItem.toUpperCase(),
    ) ??
    list.find(
      (p) => p.toUpperCase() === normalizedItem.toUpperCase(),
    )
  if (exact) {
    return {
      status: 'MATCHED',
      query,
      originalItem,
      normalizedItem,
      matchKey: itemMatchKey(exact),
      matchedItem: exact,
      candidates: [exact],
    }
  }

  // 2·3순위 — 정규화·하이픈/공백 무시 (동일 matchKey만)
  const keys = new Set(
    [originalItem, normalizedItem]
      .map((s) => itemMatchKey(s))
      .filter(Boolean),
  )
  if (keys.size === 0) {
    return {
      status: 'INVALID',
      query,
      originalItem,
      normalizedItem,
      matchKey: '',
      matchedItem: null,
      candidates: [],
    }
  }

  const byKey = new Map<string, string[]>()
  for (const p of list) {
    const k = itemMatchKey(p)
    if (!keys.has(k)) continue
    const arr = byKey.get(k) ?? []
    arr.push(p)
    byKey.set(k, arr)
  }

  if (byKey.size === 0) {
    return {
      status: 'NOT_FOUND',
      query,
      originalItem,
      normalizedItem,
      matchKey: itemMatchKey(normalizedItem || originalItem),
      matchedItem: null,
      candidates: [],
    }
  }

  if (byKey.size > 1) {
    const candidates = [...byKey.values()].flat()
    return {
      status: 'AMBIGUOUS',
      query,
      originalItem,
      normalizedItem,
      matchKey: itemMatchKey(normalizedItem || originalItem),
      matchedItem: null,
      candidates,
    }
  }

  const onlyKey = [...byKey.keys()][0]!
  const candidates = byKey.get(onlyKey) ?? []
  const matchedItem = preferDisplayItem(candidates)
  return {
    status: 'MATCHED',
    query,
    originalItem,
    normalizedItem,
    matchKey: onlyKey,
    matchedItem,
    candidates,
  }
}
