import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseConfig'

let client: SupabaseClient | null = null

/** Supabase 클라이언트 (URL·publishable 키 기본값 내장) */
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export function isCloudSyncEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}
