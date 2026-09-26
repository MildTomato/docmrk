const assert = require("node:assert/strict")
const { test } = require("node:test")
const path = require("node:path")
const Module = require("node:module")
const { buildSync } = require("esbuild")
const { JSDOM } = require("jsdom")
const React = require("react")
const { createRoot } = require("react-dom/client")
const { act } = require("react-dom/test-utils")

const filename = path.resolve(__dirname, "../components/feedback-div.tsx")
const compiled = buildSync({
  entryPoints: [filename],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "~core/messaging"]
}).outputFiles[0].text

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const feedback = { id: 1, identifier_id: "123", status: "untriaged" }
const tweet = {
  identifier_id: "123",
  metadata: {
    tweetText: "Post",
    url: "https://x.com/alice/status/123",
    author: "alice"
  }
}
const success = (data = null) => ({ data, error: null })
const error = (
  code = "NETWORK",
  message = "Cannot reach Docmrk. Try again."
) => ({ data: null, error: { code, message } })

async function setup(request) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://x.com/home" })
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const source = new Module(filename, module)
  source.paths = Module._nodeModulePaths(path.dirname(filename))
  source.require = (name) =>
    name === "~core/messaging"
      ? { requestBackground: request }
      : module.require(name)
  source._compile(compiled, filename)
  const { FeedbackDiv } = source.exports
  const container = document
    .getElementById("root")
    .attachShadow({ mode: "open" })
  const root = createRoot(container)
  const render = async (props = {}, copies = 1) => {
    await act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          ...Array.from({ length: copies }, (_, key) =>
            React.createElement(FeedbackDiv, {
              key,
              tweet,
              contextVersion: 0,
              ...props
            })
          )
        )
      )
    )
  }
  await render()
  return {
    dom,
    container,
    render,
    button: () => container.querySelector("button"),
    click: async () => {
      await act(async () => container.querySelector("button").click())
    },
    cleanup: async () => {
      await act(async () => root.unmount())
      dom.window.close()
      delete global.window
      delete global.document
      delete global.IS_REACT_ACT_ENVIRONMENT
    }
  }
}

test("checks, saves once, shows pending and saved states, and blocks post navigation", async () => {
  const lookup = deferred(),
    save = deferred(),
    calls = []
  const view = await setup((name, body) => {
    calls.push({ name, body })
    return name === "get-tweet-feedback" ? lookup.promise : save.promise
  })
  try {
    assert.equal(view.button().textContent, "Checking…")
    assert.equal(view.button().disabled, true)
    await act(async () => lookup.resolve(success()))
    assert.equal(view.button().textContent, "Save to Docmrk")
    let navigated = false
    view.dom.window.document.body.addEventListener("click", () => {
      navigated = true
    })
    await view.click()
    assert.equal(navigated, false)
    assert.equal(view.button().textContent, "Saving…")
    await view.click()
    assert.equal(
      calls.filter((call) => call.name === "post-tweet-feedback").length,
      1
    )
    assert.deepEqual(calls[1].body, tweet)
    await act(async () => save.resolve(success(feedback)))
    assert.equal(view.button().textContent, "✓ Saved to Docmrk")
    assert.equal(view.button().disabled, true)
    await view.click()
    assert.equal(calls.length, 2)
  } finally {
    await view.cleanup()
  }
})

test("save errors remain visible and retry checks the server before another insert", async () => {
  const calls = []
  const view = await setup(async (name) => {
    calls.push(name)
    return name === "post-tweet-feedback"
      ? error()
      : success(calls.length > 2 ? feedback : null)
  })
  try {
    await view.click()
    assert.equal(view.button().textContent, "Retry check")
    assert.match(
      view.container.querySelector('[role="alert"]').textContent,
      /Cannot reach/
    )
    await view.click()
    assert.deepEqual(calls, [
      "get-tweet-feedback",
      "post-tweet-feedback",
      "get-tweet-feedback"
    ])
    assert.equal(view.button().disabled, true)
  } finally {
    await view.cleanup()
  }
})

test("auth errors open setup and a context change reloads existing controls", async () => {
  let signedIn = false
  const calls = []
  const view = await setup(async (name) => {
    calls.push(name)
    return name === "open-options" || signedIn
      ? success()
      : error("AUTH_REQUIRED", "Sign in to save feedback.")
  })
  try {
    assert.equal(view.button().textContent, "Sign in to save")
    assert.equal(view.container.querySelector('[role="alert"]'), null)
    await view.click()
    assert.equal(calls[1], "open-options")
    signedIn = true
    await view.render({ contextVersion: 1 })
    assert.equal(view.button().textContent, "Save to Docmrk")
    assert.equal(calls[2], "get-tweet-feedback")
    await view.render({
      contextVersion: 1,
      tweet: {
        ...tweet,
        metadata: { ...tweet.metadata, tweetText: "Expanded post" }
      }
    })
    assert.equal(
      calls.length,
      3,
      "metadata-only changes do not fetch feedback again"
    )
  } finally {
    await view.cleanup()
  }
})

test("old context responses cannot overwrite a new organization check", async () => {
  const old = deferred()
  let count = 0
  const view = await setup(async () =>
    ++count === 1 ? old.promise : success()
  )
  try {
    await view.render({ contextVersion: 1 })
    assert.equal(view.button().textContent, "Save to Docmrk")
    await act(async () => old.resolve(success(feedback)))
    assert.equal(view.button().textContent, "Save to Docmrk")
  } finally {
    await view.cleanup()
  }
})

test("saving one copy updates other mounted copies of the same post", async () => {
  const calls = []
  const view = await setup(async (name) => {
    calls.push(name)
    return success(name === "post-tweet-feedback" ? feedback : null)
  })
  try {
    await view.render({}, 2)
    await view.click()
    for (const button of view.container.querySelectorAll("button")) {
      assert.equal(button.textContent, "✓ Saved to Docmrk")
      assert.equal(button.disabled, true)
    }
    assert.equal(
      calls.filter((name) => name === "post-tweet-feedback").length,
      1
    )
  } finally {
    await view.cleanup()
  }
})
