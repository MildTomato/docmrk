import { useCallback, useEffect, useRef, useState } from "react"

import {
  type AccountRequest,
  type AccountState,
  CONTEXT_CHANGED_KEY,
  type ExtensionError,
  type Result
} from "~core/contracts"
import { requestBackground } from "~core/messaging"

const signedOut: AccountState = {
  user: null,
  organizations: [],
  selectedOrganizationId: null
}

export function useAccount() {
  const [account, setAccount] = useState<AccountState | null>(null)
  const [error, setError] = useState<ExtensionError | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<AccountRequest["action"] | null>(null)
  const mounted = useRef(false)
  const sequence = useRef(0)
  const mutating = useRef(false)
  const refreshQueued = useRef(false)
  const refreshRef = useRef<(preserveError?: ExtensionError | null) => void>(
    () => {}
  )

  const refreshAccount = useCallback(
    async (preserveError: ExtensionError | null = null) => {
      if (mutating.current) {
        refreshQueued.current = true
        return
      }
      const request = ++sequence.current
      setLoading(true)
      setAccount(null)
      setError(preserveError)
      const result = await requestBackground<AccountState>("account", {
        action: "get"
      })
      if (!mounted.current || request !== sequence.current) return
      setAccount(
        result.data ||
          (result.error?.code === "AUTH_REQUIRED" ? signedOut : null)
      )
      setError(result.error || preserveError)
      setLoading(false)
    },
    []
  )

  refreshRef.current = refreshAccount
  const refresh = useCallback(() => {
    void refreshAccount()
  }, [refreshAccount])

  const run = useCallback(
    async (body: AccountRequest): Promise<Result<AccountState> | null> => {
      if (mutating.current) return null
      mutating.current = true
      const request = ++sequence.current
      setPending(body.action)
      setError(null)
      const result = await requestBackground<AccountState>(
        "account",
        body,
        body.action === "oauth-github" ? 120000 : undefined
      )
      if (!mounted.current || request !== sequence.current) return null
      mutating.current = false
      setPending(null)
      setLoading(false)
      setError(result.error)
      if (result.data) setAccount(result.data)
      else if (result.error?.code === "AUTH_REQUIRED") setAccount(signedOut)

      if (refreshQueued.current) {
        refreshQueued.current = false
        // Verify concurrent account changes without losing actionable mutation errors.
        refreshRef.current(result.error)
      }
      return result
    },
    []
  )

  useEffect(() => {
    mounted.current = true
    void refresh()
    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes[CONTEXT_CHANGED_KEY]) void refresh()
    }
    const onFocus = () => void refresh()
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    chrome.storage.onChanged.addListener(onStorageChange)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      mounted.current = false
      sequence.current++
      chrome.storage.onChanged.removeListener(onStorageChange)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  return { account, error, loading, pending, refresh, run }
}
