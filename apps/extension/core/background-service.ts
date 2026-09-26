import { createAccountService } from "./account-service"
import { getSupabase } from "./supabase"

export const backgroundService = createAccountService({
  getClient: getSupabase,
  storage: {
    get: (key) => chrome.storage.local.get(key),
    set: (values) => chrome.storage.local.set(values),
    remove: (key) => chrome.storage.local.remove(key)
  },
  identity: {
    getRedirectURL: () => chrome.identity.getRedirectURL("auth/callback"),
    launch: (url) =>
      chrome.identity.launchWebAuthFlow({ url, interactive: true })
  }
})
