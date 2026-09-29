/** 서버(Vite 플러그인·Vercel API)용 Supabase 설정 */
export const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim() ||
  'https://zwznfnqkqvmsxulqucml.supabase.co'

export const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  'sb_publishable_oIYbc30k0hyhKD47SJDneA_dxrxgz3-'
