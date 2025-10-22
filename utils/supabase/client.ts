// utils/supabase/client.ts

import { createBrowserClient } from '@supabase/ssr'

// This function returns a Supabase client for the browser.
// It uses the public URL + publishable key, so queries
// are safe and restricted by RLS rules.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}