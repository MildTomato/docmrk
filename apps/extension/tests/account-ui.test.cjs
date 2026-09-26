const assert = require("node:assert/strict")
const { test } = require("node:test")
const path = require("node:path")
const Module = require("node:module")
const { buildSync } = require("esbuild")
const { JSDOM } = require("jsdom")
const React = require("react")
const { createRoot } = require("react-dom/client")
const { act, Simulate } = require("react-dom/test-utils")

const compiled = new Map(
  ["options", "popup"].map((page) => {
    const filename = path.resolve(__dirname, `../${page}.tsx`)
    return [
      page,
      {
        filename,
        code: buildSync({
          entryPoints: [filename],
          bundle: true,
          platform: "node",
          format: "cjs",
          write: false,
          jsx: "automatic",
          loader: { ".css": "empty" },
          external: ["react", "react/jsx-runtime", "~core/messaging"]
        }).outputFiles[0].text
      }
    ]
  })
)

const signedOut = {
  user: null,
  organizations: [],
  selectedOrganizationId: null
}
const signedIn = {
  user: { id: "user-1", email: "member@example.com" },
  organizations: [
    { id: "org-1", name: "First team" },
    { id: "org-2", name: "Second team" }
  ],
  selectedOrganizationId: "org-1"
}
const success = (data) => ({ data, error: null })
const failure = (code, message) => ({ data: null, error: { code, message } })
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function setup(request, page = "options") {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://extension.test/options.html",
    pretendToBeVisual: true
  })
  const domGlobals = [
    "DocumentFragment",
    "HTMLElement",
    "Element",
    "Node",
    "CustomEvent",
    "Event",
    "MutationObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame"
  ]
  const previousGlobals = new Map(
    domGlobals.map((name) => [name, global[name]])
  )
  for (const name of domGlobals) global[name] = dom.window[name]
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false
  dom.window.HTMLElement.prototype.releasePointerCapture = () => {}
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const listeners = new Set()
  let openedSettings = 0
  global.chrome = {
    storage: {
      onChanged: {
        addListener: (callback) => listeners.add(callback),
        removeListener: (callback) => listeners.delete(callback)
      }
    },
    runtime: {
      openOptionsPage: async () => {
        openedSettings++
      }
    }
  }
  const { filename, code } = compiled.get(page)
  const source = new Module(filename, module)
  source.paths = Module._nodeModulePaths(path.dirname(filename))
  source.require = (name) =>
    name === "~core/messaging"
      ? { requestBackground: request }
      : module.require(name)
  source._compile(code, filename)
  const container = document.getElementById("root")
  const root = createRoot(container)
  await act(async () =>
    root.render(React.createElement(source.exports.default))
  )
  return {
    container,
    button: (text) =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === text
      ),
    change: async (selector, value) => {
      await act(async () =>
        Simulate.change(container.querySelector(selector), {
          target: { value }
        })
      )
    },
    selectOrganization: async (name) => {
      await act(async () =>
        Simulate.keyDown(container.querySelector('[role="combobox"]'), {
          key: "ArrowDown"
        })
      )
      const option = Array.from(
        document.querySelectorAll('[role="option"]')
      ).find((item) => item.textContent === name)
      assert.ok(option, `Organization option ${name} is available`)
      await act(async () => Simulate.keyDown(option, { key: "Enter" }))
    },
    submit: async () => {
      await act(async () => Simulate.submit(container.querySelector("form")))
    },
    context: async () => {
      await act(async () => {
        for (const listener of listeners)
          listener(
            { "docmrk-context-version": { newValue: Date.now() } },
            "local"
          )
      })
    },
    click: async (button) => {
      await act(async () => button.click())
    },
    settingsCount: () => openedSettings,
    cleanup: async () => {
      await act(async () => root.unmount())
      assert.equal(listeners.size, 0)
      dom.window.close()
      delete global.window
      delete global.document
      delete global.chrome
      delete global.IS_REACT_ACT_ENVIRONMENT
      for (const [name, value] of previousGlobals) {
        if (value === undefined) delete global[name]
        else global[name] = value
      }
    }
  }
}

test("expired sessions show a usable sign-in form with no stale identity", async () => {
  const view = await setup(async () =>
    failure("AUTH_REQUIRED", "Your session expired. Sign in again.")
  )
  try {
    assert.match(view.container.textContent, /Your session expired/)
    assert.ok(view.container.querySelector('input[type="email"]'))
    assert.equal(view.container.querySelector('input[type="email"]').value, "")
    assert.ok(view.button("Sign in"))
    assert.doesNotMatch(
      view.container.textContent,
      /Your account|ready to save|member@example/
    )
  } finally {
    await view.cleanup()
  }
})

test("sign-in shows pending feedback then the verified account and organization", async () => {
  const login = deferred()
  const calls = []
  const view = await setup(async (_name, body) => {
    calls.push(body)
    return body.action === "login" ? login.promise : success(signedOut)
  })
  try {
    await view.change("#email", "member@example.com")
    await view.change("#password", "example-password")
    await view.submit()
    assert.ok(view.button("Signing in…").disabled)
    assert.equal(view.container.querySelector("#password").disabled, true)
    assert.deepEqual(calls[1], {
      action: "login",
      email: "member@example.com",
      password: "example-password"
    })
    await act(async () => login.resolve(success(signedIn)))
    assert.match(view.container.textContent, /member@example.com/)
    assert.match(view.container.textContent, /You’re ready to save posts/)
    assert.equal(
      view.container.querySelector('[role="combobox"]').textContent,
      "First team"
    )
    assert.equal(view.container.querySelector('input[type="password"]'), null)
  } finally {
    await view.cleanup()
  }
})

test("email confirmation stays visible after account context refresh and does not imply sign-in", async () => {
  const signup = deferred()
  const view = await setup(async (_name, body) =>
    body.action === "signup" ? signup.promise : success(signedOut)
  )
  try {
    await view.click(view.button("Create an account"))
    await view.change("#email", "new@example.com")
    await view.change("#password", "example-password")
    await view.submit()
    await view.context()
    await act(async () =>
      signup.resolve(success({ ...signedOut, confirmationRequired: true }))
    )
    assert.match(
      view.container.textContent,
      /Check your email at new@example.com/
    )
    assert.ok(view.button("Sign in"))
    assert.equal(view.container.querySelector("#password").value, "")
    assert.doesNotMatch(
      view.container.textContent,
      /Your account|ready to save/
    )
  } finally {
    await view.cleanup()
  }
})

test("accounts without organizations get guidance and a refresh action", async () => {
  const view = await setup(async () =>
    success({ ...signedIn, organizations: [], selectedOrganizationId: null })
  )
  try {
    assert.match(
      view.container.textContent,
      /Create or join an organization in Docmrk/
    )
    assert.ok(view.button("Refresh organizations"))
    assert.equal(view.container.querySelector("select"), null)
    assert.doesNotMatch(view.container.textContent, /ready to save/)
  } finally {
    await view.cleanup()
  }
})

test("a failed account refresh hides old readiness and offers retry", async () => {
  let connected = true
  const view = await setup(
    async () =>
      connected
        ? success(signedIn)
        : failure("NETWORK", "Could not connect. Try again."),
    "popup"
  )
  try {
    assert.match(view.container.textContent, /Ready to save/)
    connected = false
    await view.context()
    assert.match(view.container.textContent, /Could not connect/)
    assert.doesNotMatch(
      view.container.textContent,
      /Ready to save|member@example.com/
    )
    connected = true
    await view.click(view.button("Try again"))
    assert.match(view.container.textContent, /Ready to save/)
    await view.click(view.button("Open settings"))
    assert.equal(view.settingsCount(), 1)
    assert.equal(
      view.container.querySelector('a[href="https://x.com/home"]').target,
      "_blank"
    )
  } finally {
    await view.cleanup()
  }
})

test("organization selection and sign-out apply the returned account state", async () => {
  let account = signedIn
  const calls = []
  const view = await setup(async (_name, body) => {
    calls.push(body)
    if (body.action === "select-organization")
      account = { ...account, selectedOrganizationId: body.organizationId }
    if (body.action === "logout") account = signedOut
    return success(account)
  })
  try {
    await view.selectOrganization("Second team")
    assert.equal(
      view.container.querySelector('[role="combobox"]').textContent,
      "Second team"
    )
    assert.deepEqual(calls[1], {
      action: "select-organization",
      organizationId: "org-2"
    })
    await view.click(view.button("Sign out"))
    assert.ok(view.button("Sign in"))
    assert.doesNotMatch(
      view.container.textContent,
      /member@example.com|ready to save/
    )
  } finally {
    await view.cleanup()
  }
})

test("stale refresh results cannot replace a newer signed-out state", async () => {
  const old = deferred()
  let calls = 0
  const view = await setup(async () =>
    ++calls === 1 ? old.promise : success(signedOut)
  )
  try {
    assert.match(view.container.textContent, /Checking your account/)
    await view.context()
    assert.ok(view.button("Sign in"))
    await act(async () => old.resolve(success(signedIn)))
    assert.ok(view.button("Sign in"))
    assert.doesNotMatch(
      view.container.textContent,
      /member@example.com|ready to save/
    )
  } finally {
    await view.cleanup()
  }
})

test("GitHub sign-in allows time for the browser flow and recovers from cancellation", async () => {
  const oauth = deferred()
  let timeout
  const view = await setup(async (_name, body, timeoutMs) => {
    if (body.action === "oauth-github") {
      timeout = timeoutMs
      return oauth.promise
    }
    return success(signedOut)
  })
  try {
    await view.click(view.button("Continue with GitHub"))
    assert.equal(timeout, 120000)
    assert.ok(view.button("Waiting for GitHub…").disabled)
    await act(async () =>
      oauth.resolve(
        failure("UNKNOWN", "GitHub sign-in was cancelled. Try again.")
      )
    )
    assert.match(view.container.textContent, /GitHub sign-in was cancelled/)
    assert.equal(view.button("Continue with GitHub").disabled, false)
  } finally {
    await view.cleanup()
  }
})
