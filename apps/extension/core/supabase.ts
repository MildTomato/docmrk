import { type SupabaseClient, createClient } from "@supabase/supabase-js"
import type { Database } from "types/supabase"

import { Storage } from "@plasmohq/storage"

const storage = new Storage({
  area: "local"
})

let client: SupabaseClient<Database> | undefined

// Only the background worker imports this module. Refreshing on demand also works
// after Chrome has suspended and restarted the worker.
export function getSupabase() {
  if (client) return client

  const url = process.env.PLASMO_PUBLIC_SUPABASE_URL
  const key = process.env.PLASMO_PUBLIC_SUPABASE_KEY
  if (!url || !key) {
    throw new Error(
      "Docmrk is not configured. Set the Supabase URL and public key, then rebuild the extension."
    )
  }

  client = createClient<Database>(url, key, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  })
  return client
}
