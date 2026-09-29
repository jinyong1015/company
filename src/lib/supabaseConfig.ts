/**
 * Supabase 클라이언트 설정.
 * publishable(anon) 키는 프론트에 노출되는 것이 정상이며,
 * 주간이슈 테이블 RLS로 접근 범위를 제한합니다.
 * VITE_* 환경변수가 있으면 그 값을 우선 사용합니다.
 */
export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  'https://zwznfnqkqvmsxulqucml.supabase.co'

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  'sb_publishable_oIYbc30k0hyhKD47SJDneA_dxrxgz3-'
