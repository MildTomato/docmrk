import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "types/supabase"

import {
  type AccountRequest,
  type AccountState,
  CONTEXT_CHANGED_KEY,
  type ExtensionError,
  type Feedback,
  type Result,
  type TweetRequest
} from "./contracts"

type LocalStorage = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (values: Record<string, unknown>) => Promise<void>
  remove: (key: string) => Promise<void>
}

type Dependencies = {
  getClient: () => SupabaseClient<Database>
  storage: LocalStorage
  identity: {
    getRedirectURL: () => string
    launch: (url: string) => Promise<string | undefined>
  }
}

class RequestError extends Error {
  constructor(public code: ExtensionError["code"], message: string) {
    super(message)
  }
}

const signedOut = (): AccountState => ({
  user: null,
  organizations: [],
  selectedOrganizationId: null
})

const organizationKey = (userId: string) => `docmrk-organization:${userId}`

function isExpiredSession(error: {
  code?: string
  status?: number
  name?: string
  message?: string
}) {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.name === "AuthSessionMissingError" ||
    [
      "refresh_token_not_found",
      "invalid_refresh_token",
      "refresh_token_already_used",
      "session_not_found",
      "user_not_found",
      "bad_jwt"
    ].includes(error.code || "") ||
    (error.status === 400 &&
      /refresh[ _-]?token/i.test(error.message || "") &&
      /invalid|not found|already used|expired/i.test(error.message || ""))
  )
}

function errorResult<T>(error: unknown): Result<T> {
  if (error instanceof RequestError) {
    return { data: null, error: { code: error.code, message: error.message } }
  }
  const details = error as { code?: string; status?: number; message?: string }
  let message = details?.message || "Something went wrong. Please try again."
  let code: ExtensionError["code"] = "UNKNOWN"
  if (details?.status === 401) {
    code = "AUTH_REQUIRED"
    message =
      "Your session has expired. Open Docmrk settings and sign in again."
  } else if (details?.status === 403 || details?.code === "42501") {
    code = "FORBIDDEN"
    message =
      "You do not have permission to save in this organization. Open settings to check your account and organization."
  } else if (details?.code === "23505") {
    return {
      data: null,
      error: {
        code: "UNKNOWN",
        message:
          "This post conflicts with an existing capture. The database must allow one capture per organization and source."
      }
    }
  } else if (/fetch|network|offline|connection|timeout/i.test(message)) {
    code = "NETWORK"
    message = "Could not reach Docmrk. Check your connection and try again."
  }
  return { data: null, error: { code, message } }
}

async function result<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await operation(), error: null }
  } catch (error) {
    return errorResult(error)
  }
}

function validateTweet(request: TweetRequest) {
  if (
    !request ||
    typeof request.identifier_id !== "string" ||
    !/^\d{1,30}$/.test(request.identifier_id)
  ) {
    throw new RequestError(
      "INVALID_REQUEST",
      "This post does not have a valid X post ID."
    )
  }
  if (request.metadata != null) {
    if (
      typeof request.metadata !== "object" ||
      Array.isArray(request.metadata)
    ) {
      throw new RequestError("INVALID_REQUEST", "The post content is invalid.")
    }
    for (const value of Object.values(request.metadata)) {
      if (
        value != null &&
        (typeof value !== "string" || value.length > 100_000)
      ) {
        throw new RequestError(
          "INVALID_REQUEST",
          "The post content is invalid or too long."
        )
      }
    }
  }
}

export function createAccountService(deps: Dependencies) {
  let client: SupabaseClient<Database> | undefined
  let cleanup: Promise<void> | undefined
  let contextPromise: Promise<AccountState> | undefined
  let generation = 0
  let accountTransition = 0
  let mutationQueue = Promise.resolve()
  let notificationQueue = Promise.resolve()
  const pendingCaptures = new Map<string, Promise<Result<Feedback>>>()

  function invalidateContext() {
    generation += 1
    contextPromise = undefined
  }

  function publishContext(
    userId: string | null,
    organizationId: string | null,
    expectedGeneration = generation
  ) {
    const next = notificationQueue.then(async () => {
      if (expectedGeneration !== generation) return
      const marker = { userId, organizationId }
      const saved = (await deps.storage.get(CONTEXT_CHANGED_KEY))[
        CONTEXT_CHANGED_KEY
      ]
      if (expectedGeneration !== generation) return
      if (JSON.stringify(saved) !== JSON.stringify(marker)) {
        await deps.storage.set({ [CONTEXT_CHANGED_KEY]: marker })
      }
    })
    notificationQueue = next.catch(() => {})
    return next
  }

  async function getClient() {
    // Old versions persisted a standalone user object even without a session.
    cleanup ??= deps.storage.remove("user")
    await cleanup
    if (!client) {
      client = deps.getClient()
      client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          invalidateContext()
          void publishContext(null, null).catch(() => {})
        }
      })
    }
    return client
  }

  async function loadAccountState(
    insideMutation = false
  ): Promise<AccountState> {
    const expectedGeneration = generation
    const expectedTransition = accountTransition
    const supabase = await getClient()
    // getSession can refresh and replace stored credentials. Keep that part in
    // the auth queue even when the rest of this operation is a concurrent read.
    const sessionResult = await (insideMutation
      ? supabase.auth.getSession()
      : mutate(() => supabase.auth.getSession()))
    if (sessionResult.error) {
      if (isExpiredSession(sessionResult.error)) {
        return expireSession(
          supabase,
          expectedGeneration,
          expectedTransition,
          insideMutation
        )
      }
      throw sessionResult.error
    }
    if (!sessionResult.data.session) {
      if (expectedGeneration !== generation) {
        throw new RequestError(
          "AUTH_REQUIRED",
          "Your account changed. Please try again."
        )
      }
      await publishContext(null, null, expectedGeneration)
      return signedOut()
    }

    // Verify the stored session with Auth before using its user as capture owner.
    // Verify the captured token without letting a delayed read refresh or clear
    // credentials belonging to a newer sign-in.
    const verified = await supabase.auth.getUser(
      sessionResult.data.session.access_token
    )
    if (verified.error) {
      if (isExpiredSession(verified.error)) {
        return expireSession(
          supabase,
          expectedGeneration,
          expectedTransition,
          insideMutation
        )
      }
      throw verified.error
    }
    const user = verified.data.user
    if (!user)
      throw new RequestError(
        "AUTH_REQUIRED",
        "Sign in to Docmrk to save posts."
      )

    const organizationsResult = await supabase
      .from("organizations")
      .select("id, name")
      .order("name")
    if (organizationsResult.error) throw organizationsResult.error
    const organizations = organizationsResult.data || []
    const key = organizationKey(user.id)
    const storedId = (await deps.storage.get(key))[key]
    let selectedOrganizationId = organizations.some(
      (organization) => organization.id === storedId
    )
      ? (storedId as string)
      : null
    if (!selectedOrganizationId && organizations.length === 1) {
      selectedOrganizationId = organizations[0].id
    }
    if (expectedGeneration !== generation) {
      throw new RequestError(
        "AUTH_REQUIRED",
        "Your account changed. Please try again."
      )
    }
    if (selectedOrganizationId !== storedId) {
      if (selectedOrganizationId)
        await deps.storage.set({ [key]: selectedOrganizationId })
      else if (storedId != null) await deps.storage.remove(key)
    }
    await publishContext(user.id, selectedOrganizationId, expectedGeneration)
    return {
      user: { id: user.id, email: user.email },
      organizations,
      selectedOrganizationId
    }
  }

  async function expireSession(
    supabase: SupabaseClient<Database>,
    expectedGeneration: number,
    expectedTransition: number,
    insideMutation: boolean
  ) {
    const expire = async () => {
      if (expectedTransition !== accountTransition) {
        throw new RequestError(
          "AUTH_REQUIRED",
          "Your account changed. Please try again."
        )
      }
      // A SIGNED_OUT event from Auth may already have cleared this session.
      // Never clear any credentials when this read's generation has changed.
      if (expectedGeneration !== generation) return signedOut()
      const logout = await supabase.auth.signOut({ scope: "local" })
      if (logout.error && !isExpiredSession(logout.error)) throw logout.error
      invalidateContext()
      await publishContext(null, null)
      return signedOut()
    }
    if (expectedTransition !== accountTransition) {
      throw new RequestError(
        "AUTH_REQUIRED",
        "Your account changed. Please try again."
      )
    }
    // A save or account action already owns the queue. Enqueuing again there
    // would deadlock; independent reads must queue their destructive cleanup.
    return insideMutation ? expire() : mutate(expire)
  }

  function getAccountState(insideMutation = false) {
    // Do not join a concurrent read that might need to enqueue session cleanup
    // behind the mutation currently calling us.
    if (insideMutation) return loadAccountState(true)
    if (!contextPromise) {
      const pending = loadAccountState()
      contextPromise = pending
      void pending
        .finally(() => {
          if (contextPromise === pending) contextPromise = undefined
        })
        .catch(() => {})
    }
    return contextPromise
  }

  function mutate<T>(operation: () => Promise<T>) {
    const next = mutationQueue.then(operation, operation)
    mutationQueue = next.then(
      () => {},
      () => {}
    )
    return next
  }

  async function captureContext(insideMutation = false) {
    const account = await getAccountState(insideMutation)
    if (!account.user)
      throw new RequestError(
        "AUTH_REQUIRED",
        "Sign in to Docmrk to save posts."
      )
    if (!account.selectedOrganizationId) {
      throw new RequestError(
        "ORGANIZATION_REQUIRED",
        "Choose an organization in Docmrk before saving posts."
      )
    }
    return {
      userId: account.user.id,
      organizationId: account.selectedOrganizationId
    }
  }

  async function findTweet(
    supabase: SupabaseClient<Database>,
    organizationId: string,
    id: string
  ) {
    const response = await supabase
      .from("feedback")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("source", "TWITTER")
      .eq("identifier_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (response.error) throw response.error
    return response.data
  }

  async function accountAction(request: AccountRequest): Promise<AccountState> {
    if (!request || typeof request !== "object") {
      throw new RequestError(
        "INVALID_REQUEST",
        "Choose a valid account action."
      )
    }
    const supabase = await getClient()
    switch (request.action) {
      case "get":
        return getAccountState()
      case "login":
      case "signup": {
        if (
          typeof request.email !== "string" ||
          !request.email.trim() ||
          typeof request.password !== "string" ||
          !request.password
        ) {
          throw new RequestError(
            "INVALID_REQUEST",
            "Enter your email address and password."
          )
        }
        invalidateContext()
        const credentials = {
          email: request.email.trim(),
          password: request.password
        }
        const response =
          request.action === "login"
            ? await supabase.auth.signInWithPassword(credentials)
            : await supabase.auth.signUp(credentials)
        if (response.error) throw response.error
        if (!response.data.session) {
          if (request.action === "signup") {
            await publishContext(null, null)
            return { ...signedOut(), confirmationRequired: true }
          }
          throw new RequestError(
            "AUTH_REQUIRED",
            "Sign-in did not return a session. Please try again."
          )
        }
        return getAccountState(true)
      }
      case "logout": {
        const response = await supabase.auth.signOut({ scope: "local" })
        if (response.error) throw response.error
        invalidateContext()
        await publishContext(null, null)
        return signedOut()
      }
      case "select-organization": {
        const account = await getAccountState(true)
        if (!account.user)
          throw new RequestError("AUTH_REQUIRED", "Sign in to Docmrk first.")
        if (
          !account.organizations.some(
            (organization) => organization.id === request.organizationId
          )
        ) {
          throw new RequestError(
            "FORBIDDEN",
            "This organization is not available to your account."
          )
        }
        await deps.storage.set({
          [organizationKey(account.user.id)]: request.organizationId
        })
        invalidateContext()
        await publishContext(account.user.id, request.organizationId)
        return { ...account, selectedOrganizationId: request.organizationId }
      }
      case "oauth-github": {
        invalidateContext()
        const redirectTo = deps.identity.getRedirectURL()
        const authorization = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: { redirectTo, skipBrowserRedirect: true }
        })
        if (authorization.error) throw authorization.error
        if (!authorization.data.url)
          throw new RequestError("UNKNOWN", "GitHub sign-in could not start.")
        const callback = await deps.identity.launch(authorization.data.url)
        if (!callback)
          throw new RequestError(
            "UNKNOWN",
            "GitHub sign-in was cancelled. Please try again."
          )
        const callbackUrl = new URL(callback)
        const expectedUrl = new URL(redirectTo)
        if (
          callbackUrl.origin !== expectedUrl.origin ||
          callbackUrl.pathname !== expectedUrl.pathname
        ) {
          throw new RequestError(
            "INVALID_REQUEST",
            "GitHub returned an unexpected callback. Check the Supabase redirect URL configuration."
          )
        }
        const callbackError =
          callbackUrl.searchParams.get("error_description") ||
          callbackUrl.searchParams.get("error")
        if (callbackError) throw new RequestError("UNKNOWN", callbackError)
        const code = callbackUrl.searchParams.get("code")
        if (!code)
          throw new RequestError(
            "UNKNOWN",
            "GitHub sign-in did not return an authorization code. Check the Supabase redirect URL configuration."
          )
        const response = await supabase.auth.exchangeCodeForSession(code)
        if (response.error) throw response.error
        if (!response.data.session)
          throw new RequestError(
            "AUTH_REQUIRED",
            "GitHub sign-in did not create a session."
          )
        return getAccountState(true)
      }
      default:
        throw new RequestError(
          "INVALID_REQUEST",
          "Choose a valid account action."
        )
    }
  }

  return {
    account(request: AccountRequest): Promise<Result<AccountState>> {
      if (request?.action === "get") {
        return result(async () => {
          await mutationQueue
          return accountAction(request)
        })
      }
      accountTransition += 1
      return result(() => mutate(() => accountAction(request)))
    },
    getTweet(request: TweetRequest): Promise<Result<Feedback>> {
      return result(async () => {
        validateTweet(request)
        await mutationQueue
        const { organizationId } = await captureContext()
        return findTweet(
          await getClient(),
          organizationId,
          request.identifier_id
        )
      })
    },
    postTweet(request: TweetRequest): Promise<Result<Feedback>> {
      // Account transitions and writes share a queue: a save cannot accidentally
      // use a new account's token with the previous account's organization.
      const key = `${accountTransition}:${request?.identifier_id}`
      if (pendingCaptures.has(key)) return pendingCaptures.get(key)!
      const pending = result(() =>
        mutate(async () => {
          validateTweet(request)
          const { userId, organizationId } = await captureContext(true)
          const supabase = await getClient()
          const existing = await findTweet(
            supabase,
            organizationId,
            request.identifier_id
          )
          if (existing) return existing
          const response = await supabase
            .from("feedback")
            .insert({
              source: "TWITTER",
              identifier_id: request.identifier_id,
              organization_id: organizationId,
              inserted_by: userId,
              metadata: {
                tweetText: request.metadata?.tweetText || "",
                author: request.metadata?.author || "",
                url:
                  request.metadata?.url ||
                  `https://x.com/i/status/${request.identifier_id}`
              }
            })
            .select("*")
            .single()
          if (response.error?.code === "23505") {
            const captured = await findTweet(
              supabase,
              organizationId,
              request.identifier_id
            )
            if (captured) return captured
          }
          if (response.error) throw response.error
          if (!response.data)
            throw new RequestError(
              "UNKNOWN",
              "The post was saved but could not be read back. Check database permissions before retrying."
            )
          return response.data
        })
      )
      pendingCaptures.set(key, pending)
      void pending.finally(() => {
        if (pendingCaptures.get(key) === pending) pendingCaptures.delete(key)
      })
      return pending
    }
  }
}
