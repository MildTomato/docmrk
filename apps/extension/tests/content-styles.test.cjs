const assert = require("node:assert/strict")
const { test } = require("node:test")
const path = require("node:path")
const Module = require("node:module")
const { buildSync } = require("esbuild")
const { JSDOM } = require("jsdom")
const { act } = require("react-dom/test-utils")

const filename = path.resolve(__dirname, "../contents/twitter.ts")
const cssImport = "data-text:~content-style.css"
const compiled = buildSync({
  entryPoints: [filename],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  jsx: "automatic",
  external: [
    "react",
    "react/jsx-runtime",
    "react-dom/client",
    cssImport,
    "~core/messaging"
  ]
}).outputFiles[0].text

test("shared control styles stay inside each shadow root and survive account refresh", async () => {
  const dom = new JSDOM(
    '<article data-testid="tweet"><div data-testid="User-Name"><a href="/alice/status/123"><time>Today</time></a></div></article>',
    { url: "https://x.com/home" }
  )
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  let contextChanged
  let reads = 0
  global.chrome = {
    storage: {
      onChanged: {
        addListener: (listener) => {
          contextChanged = listener
        },
        removeListener: (listener) => {
          if (contextChanged === listener) contextChanged = undefined
        }
      }
    }
  }
  const css =
    ":host { --background: 0 0% 100%; } .bg-background { background-color: hsl(var(--background)); }"
  const source = new Module(filename, module)
  source.paths = Module._nodeModulePaths(path.dirname(filename))
  source.require = (name) =>
    name === cssImport
      ? css
      : name === "~core/messaging"
      ? {
          requestBackground: async () => {
            reads += 1
            return { data: null, error: null }
          }
        }
      : module.require(name)
  try {
    await act(async () => source._compile(compiled, filename))
    const host = document.querySelector("[data-docmrk-feedback]")
    const shadow = host.shadowRoot
    assert.equal(
      document.querySelectorAll("style").length,
      0,
      "the page must not receive Docmrk CSS"
    )
    assert.equal(shadow.querySelector("style").textContent, css)
    assert.equal(
      shadow.querySelector("button").classList.contains("bg-background"),
      true
    )
    assert.equal(shadow.querySelector("button").textContent, "Save to Docmrk")
    await act(async () =>
      contextChanged(
        { "docmrk-context-version": { newValue: "changed" } },
        "local"
      )
    )
    assert.equal(reads, 2)
    assert.equal(shadow.querySelectorAll("style").length, 1)
    assert.equal(
      shadow.querySelector("style").textContent,
      css,
      "React rerenders must preserve the stylesheet"
    )
    await act(async () =>
      window.dispatchEvent(
        new dom.window.PageTransitionEvent("pagehide", { persisted: false })
      )
    )
    assert.equal(document.querySelector("[data-docmrk-feedback]"), null)
    assert.equal(contextChanged, undefined)
  } finally {
    if (contextChanged)
      await act(async () =>
        window.dispatchEvent(
          new dom.window.PageTransitionEvent("pagehide", { persisted: false })
        )
      )
    dom.window.close()
    delete global.window
    delete global.document
    delete global.chrome
    delete global.IS_REACT_ACT_ENVIRONMENT
  }
})
