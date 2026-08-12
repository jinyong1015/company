/** 기간/정렬이 바뀌어도 같은 대상을 가리키는 고정 ID */
export function toEntityId(prefix: 'ins' | 'prd' | 'mld' | 'eq' | 'wrk', key: string) {
  return `${prefix}-${encodeURIComponent(key)}`
}

export function fromEntityId(id: string | undefined, prefix: string) {
  if (!id) return ''
  const head = `${prefix}-`
  const raw = id.startsWith(head) ? id.slice(head.length) : id
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
