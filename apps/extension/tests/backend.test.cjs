const assert = require("node:assert/strict")
const path = require("node:path")
const test = require("node:test")
const { buildSync } = require("esbuild")

const compiled = { exports: {} }
const source = buildSync({
  entryPoints: [path.join(__dirname, "../core/account-service.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false
}).outputFiles[0].text
new Function("module", "exports", "require", source)(
  compiled,
  compiled.exports,
  require
)
const { createAccountService } = compiled.exports

const USER_A = { id: "user-a", email: "a@example.test" }
const USER_B = { id: "user-b", email: "b@example.test" }
const ORG_A = { id: "organization-a", name: "Alpha" }
const ORG_B = { id: "organization-b", name: "Beta" }

function setup(options = {}) {
  const saved = new Map(Object.entries(options.saved || {}))
  const calls = {
    inserts: [],
    reads: [],
    notifications: [],
    exchanges: [],
    signOut: 0
  }
  const state = {
    user: USER_A,
    organizations: [ORG_A],
    feedback: [],
    ...options
  }
  let authListener
  const client = {
    auth: {
      onAuthStateChange(callback) {
        authListener = callback
        return { data: { subscription: { unsubscribe() {} } } }
      },
      async getSession() {
        return {
          data: {
            session: state.user
              ? {
                  user: state.user,
                  access_token: "secret-access-token",
                  refresh_token: "secret-refresh-token"
                }
              : null
          },
          error: state.sessionError || null
        }
      },
      async getUser() {
        return { data: { user: state.user }, error: state.userError || null }
      },
      async signInWithPassword({ email }) {
        if (state.loginError)
          return { data: { session: null }, error: state.loginError }
        state.user = email === USER_B.email ? USER_B : USER_A
        authListener?.("SIGNED_IN", { user: state.user })
        return { data: { session: { user: state.user } }, error: null }
      },
      async signUp() {
        if (state.confirmationRequired)
          return { data: { user: USER_A, session: null }, error: null }
        state.user = USER_A
        return {
          data: { user: USER_A, session: { user: USER_A } },
          error: null
        }
      },
      async signOut() {
        calls.signOut += 1
        if (state.signOutError) return { error: state.signOutError }
        state.user = null
        authListener?.("SIGNED_OUT", null)
        return { error: null }
      },
      async signInWithOAuth(options) {
        state.oauthOptions = options
        return {
          data: {
            url: "https://example.supabase.co/auth/v1/authorize?provider=github"
          },
          error: null
        }
      },
      async exchangeCodeForSession(code) {
        calls.exchanges.push(code)
        if (state.exchangeError)
          return { data: { session: null }, error: state.exchangeError }
        state.user = USER_A
        return { data: { session: { user: USER_A } }, error: null }
      }
    },
    from(table) {
      const filters = {}
      const ordering = []
      let insertion
      let limit
      const query = {
        select() {
          return query
        },
        eq(key, value) {
          filters[key] = value
          return query
        },
        order(key) {
          ordering.push(key)
          return query
        },
        limit(value) {
          limit = value
          return query
        },
        insert(value) {
          insertion = value
          return query
        },
        async maybeSingle() {
          calls.reads.push({ table, filters: { ...filters }, limit, ordering })
          if (state.readError) return { data: null, error: state.readError }
          const rows = state.feedback.filter((row) =>
            Object.entries(filters).every(([key, value]) => row[key] === value)
          )
          rows.sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id
          )
          return { data: rows[0] || null, error: null }
        },
        async single() {
          calls.inserts.push(insertion)
          if (state.insertGate) await state.insertGate
          if (state.raceWinner) {
            state.feedback.push(state.raceWinner)
            return {
              data: null,
              error: { code: "23505", message: "duplicate key" }
            }
          }
          if (state.insertError) return { data: null, error: state.insertError }
          const data = {
            id: state.feedback.length + 1,
            created_at: "2026-09-26T00:00:00Z",
            status: "untriaged",
            updated_at: null,
            ...insertion
          }
          state.feedback.push(data)
          return { data, error: null }
        },
        then(resolve, reject) {
          assert.equal(table, "organizations")
          return Promise.resolve({
            data: state.organizations,
            error: state.organizationsError || null
          }).then(resolve, reject)
        }
      }
      return query
    }
  }
  const service = createAccountService({
    getClient: () => client,
    storage: {
      async get(key) {
        return { [key]: saved.get(key) }
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) {
          saved.set(key, value)
          if (key === "docmrk-context-version") calls.notifications.push(value)
        }
      },
      async remove(key) {
        saved.delete(key)
      }
    },
    identity: {
      getRedirectURL: () =>
        "https://extension-id.chromiumapp.org/auth/callback",
      async launch() {
        return (
          state.callback ||
          "https://extension-id.chromiumapp.org/auth/callback?code=auth-code"
        )
      }
    }
  })
  return {
    service,
    client,
    state,
    saved,
    calls,
    emit: (event) => authListener?.(event, { user: state.user })
  }
}

function feedback(id, organizationId, overrides = {}) {
  return {
    id,
    identifier_id: "123",
    organization_id: organizationId,
    source: "TWITTER",
    created_at: `2026-09-${String(id).padStart(2, "0")}T00:00:00Z`,
    ...overrides
  }
}

test("account derives verified identity, removes the legacy user, and does not expose tokens", async () => {
  const { service, saved, calls, emit } = setup({
    saved: { user: { id: "stale-user" } }
  })
  const response = await service.account({ action: "get" })
  assert.equal(response.error, null)
  assert.deepEqual(response.data.user, USER_A)
  assert.equal(response.data.selectedOrganizationId, ORG_A.id)
  assert.equal(saved.has("user"), false)
  assert.doesNotMatch(
    JSON.stringify(response),
    /secret|access_token|refresh_token/
  )
  await service.account({ action: "get" })
  emit("TOKEN_REFRESHED")
  await service.account({ action: "get" })
  assert.equal(
    calls.notifications.length,
    1,
    "unchanged account and token refresh must not trigger content refresh loops"
  )
})

test("confirmation-required signup returns signed out despite a returned user", async () => {
  const { service } = setup({ user: null, confirmationRequired: true })
  const response = await service.account({
    action: "signup",
    email: USER_A.email,
    password: "test-password"
  })
  assert.equal(response.error, null)
  assert.equal(response.data.user, null)
  assert.equal(response.data.confirmationRequired, true)
})

test("invalid persisted session clears auth and blocks feedback requests", async () => {
  const { service, calls } = setup({
    userError: { status: 401, message: "Session revoked" }
  })
  const response = await service.getTweet({ identifier_id: "123" })
  assert.equal(response.error.code, "AUTH_REQUIRED")
  assert.equal(calls.signOut, 1)
  assert.equal(calls.reads.length, 0)
  assert.deepEqual(calls.notifications.at(-1), {
    userId: null,
    organizationId: null
  })
})

test("terminal refresh-token errors immediately return signed out, while network failures preserve the session", async () => {
  for (const sessionError of [
    {
      status: 400,
      code: "refresh_token_not_found",
      message: "Invalid Refresh Token"
    },
    {
      status: 400,
      code: "refresh_token_already_used",
      message: "Refresh token already used"
    },
    { status: 400, message: "Invalid Refresh Token: Refresh Token Not Found" },
    {
      status: 400,
      name: "AuthSessionMissingError",
      message: "Auth session missing!"
    }
  ]) {
    const fixture = setup({ sessionError })
    const response = await fixture.service.account({ action: "get" })
    assert.equal(response.error, null)
    assert.equal(response.data.user, null)
    assert.equal(fixture.calls.signOut, 1)
  }
  const offline = setup({
    sessionError: { status: 0, message: "Network request failed" }
  })
  const response = await offline.service.account({ action: "get" })
  assert.equal(response.error.code, "NETWORK")
  assert.equal(offline.calls.signOut, 0)
  assert.deepEqual(offline.state.user, USER_A)
})

test(
  "a delayed rejection for the old user cannot sign out a completed new login",
  { timeout: 2000 },
  async () => {
    const { service, client, state, calls } = setup()
    const originalGetUser = client.auth.getUser
    let releaseOldUser
    let markStarted
    const started = new Promise((resolve) => {
      markStarted = resolve
    })
    client.auth.getUser = () => {
      client.auth.getUser = originalGetUser
      markStarted()
      return new Promise((resolve) => {
        releaseOldUser = resolve
      })
    }
    const oldRead = service.getTweet({ identifier_id: "123" })
    await started
    const login = await service.account({
      action: "login",
      email: USER_B.email,
      password: "test-password"
    })
    assert.equal(login.data.user.id, USER_B.id)
    releaseOldUser({
      data: { user: null },
      error: { status: 401, message: "Old session revoked" }
    })
    assert.equal((await oldRead).error.code, "AUTH_REQUIRED")
    assert.equal(state.user.id, USER_B.id)
    assert.equal(calls.signOut, 0)
    assert.deepEqual(calls.notifications.at(-1), {
      userId: USER_B.id,
      organizationId: ORG_A.id
    })
  }
)

test(
  "stale user failure cannot deadlock a pending save and queued logout",
  { timeout: 2000 },
  async () => {
    let releaseInsert
    const insertGate = new Promise((resolve) => {
      releaseInsert = resolve
    })
    const { service, client, calls, state } = setup({ insertGate })
    const originalGetUser = client.auth.getUser
    let releaseOldUser
    let markStarted
    const started = new Promise((resolve) => {
      markStarted = resolve
    })
    client.auth.getUser = () => {
      client.auth.getUser = originalGetUser
      markStarted()
      return new Promise((resolve) => {
        releaseOldUser = resolve
      })
    }
    const oldRead = service.getTweet({ identifier_id: "123" })
    await started
    const save = service.postTweet({ identifier_id: "456" })
    const logout = service.account({ action: "logout" })
    releaseOldUser({
      data: { user: null },
      error: { status: 401, message: "Old session revoked" }
    })
    assert.equal((await oldRead).error.code, "AUTH_REQUIRED")
    releaseInsert()
    assert.equal((await save).data.identifier_id, "456")
    assert.equal((await logout).data.user, null)
    assert.equal(state.user, null)
    assert.equal(
      calls.signOut,
      1,
      "only the explicit logout clears credentials"
    )
  }
)

test(
  "session expiration inside a queued save settles without re-enqueuing itself",
  { timeout: 2000 },
  async () => {
    const { service, calls } = setup({
      userError: { status: 401, message: "Session revoked" }
    })
    const response = await service.postTweet({ identifier_id: "123" })
    assert.equal(response.error.code, "AUTH_REQUIRED")
    assert.equal(calls.signOut, 1)
    assert.equal(calls.inserts.length, 0)
  }
)

test("invalid credentials and failed logout are surfaced", async () => {
  const fixture = setup({
    loginError: { status: 400, message: "Invalid login credentials" },
    signOutError: { message: "Network request failed" }
  })
  const login = await fixture.service.account({
    action: "login",
    email: USER_A.email,
    password: "wrong"
  })
  assert.equal(login.data, null)
  assert.match(login.error.message, /Invalid login/)
  const logout = await fixture.service.account({ action: "logout" })
  assert.equal(logout.error.code, "NETWORK")
  assert.deepEqual(fixture.state.user, USER_A)
})

test("selection is required with multiple organizations and unavailable choices are rejected", async () => {
  const { service, saved, calls } = setup({
    organizations: [ORG_A, ORG_B],
    saved: { "docmrk-organization:user-a": "removed-organization" }
  })
  assert.equal(
    (await service.getTweet({ identifier_id: "123" })).error.code,
    "ORGANIZATION_REQUIRED"
  )
  assert.equal(saved.has("docmrk-organization:user-a"), false)
  assert.equal(calls.reads.length, 0)
  assert.equal(
    (
      await service.account({
        action: "select-organization",
        organizationId: "forbidden"
      })
    ).error.code,
    "FORBIDDEN"
  )
  const selected = await service.account({
    action: "select-organization",
    organizationId: ORG_B.id
  })
  assert.equal(selected.data.selectedOrganizationId, ORG_B.id)
  assert.equal(saved.get("docmrk-organization:user-a"), ORG_B.id)
})

test("organization selection is isolated by user", async () => {
  const { service, saved } = setup({
    organizations: [ORG_A, ORG_B],
    saved: {
      "docmrk-organization:user-a": ORG_A.id,
      "docmrk-organization:user-b": ORG_B.id
    }
  })
  await service.account({ action: "logout" })
  const response = await service.account({
    action: "login",
    email: USER_B.email,
    password: "test-password"
  })
  assert.deepEqual(response.data.user, USER_B)
  assert.equal(response.data.selectedOrganizationId, ORG_B.id)
  assert.equal(saved.get("docmrk-organization:user-a"), ORG_A.id)
})

test("lookup scopes organization and source and takes the latest duplicate", async () => {
  const { service, calls } = setup({
    feedback: [
      feedback(1, ORG_A.id),
      feedback(2, ORG_A.id),
      feedback(3, ORG_B.id),
      feedback(4, ORG_A.id, { source: "EMAIL" })
    ]
  })
  const response = await service.getTweet({ identifier_id: "123" })
  assert.equal(response.data.id, 2)
  assert.deepEqual(calls.reads[0].filters, {
    organization_id: ORG_A.id,
    source: "TWITTER",
    identifier_id: "123"
  })
  assert.equal(calls.reads[0].limit, 1)
})

test("concurrent and repeated saves insert once and return the stored row", async () => {
  const { service, calls } = setup()
  const request = {
    identifier_id: "123",
    metadata: { tweetText: "Useful feedback", author: "tester" }
  }
  const responses = await Promise.all([
    service.postTweet(request),
    service.postTweet(request),
    service.postTweet(request)
  ])
  assert.equal(calls.inserts.length, 1)
  assert.equal(calls.inserts[0].inserted_by, USER_A.id)
  assert.equal(calls.inserts[0].organization_id, ORG_A.id)
  assert.equal(calls.inserts[0].metadata.tweetText, "Useful feedback")
  for (const response of responses) assert.equal(response.data.id, 1)
  assert.equal((await service.postTweet(request)).data.id, 1)
  assert.equal(calls.inserts.length, 1)
})

test("an organization switch between pending saves does not reuse the old capture", async () => {
  const { service, calls } = setup({
    organizations: [ORG_A, ORG_B],
    saved: { "docmrk-organization:user-a": ORG_A.id }
  })
  const first = service.postTweet({ identifier_id: "123" })
  const selection = service.account({
    action: "select-organization",
    organizationId: ORG_B.id
  })
  const second = service.postTweet({ identifier_id: "123" })
  const results = await Promise.all([first, selection, second])
  assert.equal(results[0].data.organization_id, ORG_A.id)
  assert.equal(results[2].data.organization_id, ORG_B.id)
  assert.equal(calls.inserts.length, 2)
})

test("a duplicate race returns its winning row only within the selected organization", async () => {
  const matching = setup({ raceWinner: feedback(7, ORG_A.id) })
  assert.equal(
    (await matching.service.postTweet({ identifier_id: "123" })).data.id,
    7
  )
  const wrongOrganization = setup({ raceWinner: feedback(8, ORG_B.id) })
  const failure = await wrongOrganization.service.postTweet({
    identifier_id: "123"
  })
  assert.equal(failure.data, null)
  assert.match(failure.error.message, /conflicts with an existing capture/)
})

test("RLS rejection is an explicit forbidden error", async () => {
  const { service } = setup({
    insertError: {
      code: "42501",
      message: "new row violates row-level security policy"
    }
  })
  const response = await service.postTweet({ identifier_id: "123" })
  assert.equal(response.data, null)
  assert.equal(response.error.code, "FORBIDDEN")
  assert.match(
    response.error.message,
    /Open settings to check your account and organization/
  )
  assert.doesNotMatch(response.error.message, /row-level security|policy|42501/)
})

test("invalid requests cannot reach the database", async () => {
  const { service, calls } = setup()
  for (const request of [
    undefined,
    {},
    { identifier_id: "not-a-post" },
    { identifier_id: "123", metadata: { tweetText: {} } }
  ]) {
    assert.equal(
      (await service.postTweet(request)).error.code,
      "INVALID_REQUEST"
    )
  }
  assert.equal(calls.inserts.length, 0)
  assert.equal(calls.reads.length, 0)
})

test("GitHub uses the identity redirect and exchanges only a matching PKCE callback", async () => {
  const fixture = setup({ user: null })
  const response = await fixture.service.account({ action: "oauth-github" })
  assert.equal(response.error, null)
  assert.deepEqual(response.data.user, USER_A)
  assert.deepEqual(fixture.calls.exchanges, ["auth-code"])
  assert.deepEqual(fixture.state.oauthOptions, {
    provider: "github",
    options: {
      redirectTo: "https://extension-id.chromiumapp.org/auth/callback",
      skipBrowserRedirect: true
    }
  })
  const invalid = setup({
    user: null,
    callback: "https://example.test/auth/callback?code=wrong"
  })
  assert.equal(
    (await invalid.service.account({ action: "oauth-github" })).error.code,
    "INVALID_REQUEST"
  )
  assert.equal(invalid.calls.exchanges.length, 0)
})
