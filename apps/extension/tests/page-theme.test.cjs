const assert = require("node:assert/strict")
const { test } = require("node:test")
const path = require("node:path")
const Module = require("node:module")
const { buildSync } = require("esbuild")
const { JSDOM } = require("jsdom")

const filename = path.resolve(__dirname, "../core/page-theme.ts")
const compiled = buildSync({
  entryPoints: [filename],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false
}).outputFiles[0].text
const source = new Module(filename, module)
source._compile(compiled, filename)
const { pageUsesDarkTheme, observePageTheme } = source.exports
const settle = () => new Promise((resolve) => setTimeout(resolve, 15))

function page(
  html = "<main role='main'><div data-testid='primaryColumn'></div></main>"
) {
  return new JSDOM(html, { url: "https://x.com/home" })
}

function mediaPreference(view, dark) {
  const listeners = new Set()
  const media = {
    matches: dark,
    addEventListener: (type, listener) => listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener)
  }
  view.matchMedia = () => media
  return {
    listeners,
    set(value) {
      media.matches = value
      for (const listener of listeners) listener()
    }
  }
}

test("X's light, dim, and black backgrounds override the system preference", () => {
  const dom = page()
  const document = dom.window.document
  for (const [color, expected] of [
    ["rgb(255, 255, 255)", false],
    ["rgb(21, 32, 43)", true],
    ["rgb(0, 0, 0)", true]
  ]) {
    document.body.style.backgroundColor = color
    assert.equal(pageUsesDarkTheme(document, !expected), expected, color)
  }
  document.querySelector(
    '[data-testid="primaryColumn"]'
  ).style.backgroundColor = "white"
  assert.equal(
    pageUsesDarkTheme(document, true),
    false,
    "the actual timeline surface takes precedence over a dark backing body"
  )
  dom.window.close()
})

test("transparent page surfaces use the document background and explicit color scheme before system fallback", () => {
  const dom = page()
  const document = dom.window.document
  document.documentElement.style.backgroundColor = "white"
  document.body.style.backgroundColor = "rgba(0, 0, 0, 0)"
  assert.equal(pageUsesDarkTheme(document, true), false)
  document.documentElement.style.backgroundColor = "transparent"
  document.documentElement.style.colorScheme = "dark"
  assert.equal(pageUsesDarkTheme(document, false), true)
  document.documentElement.style.colorScheme = "light"
  assert.equal(pageUsesDarkTheme(document, true), false)
  document.documentElement.style.colorScheme = "normal"
  assert.equal(pageUsesDarkTheme(document, true), true)
  assert.equal(pageUsesDarkTheme(document, false), false)
  dom.window.close()
})

test("mounted hosts follow live body/html classes, inline styles, and stylesheet changes", async () => {
  const dom = page(
    '<style>body { background: white; } .dim { background: rgb(21, 32, 43); }</style><main role="main"></main>'
  )
  const document = dom.window.document
  const observer = observePageTheme(document)
  const host = document.createElement("span")
  host.setAttribute("data-docmrk-feedback", "")
  document.querySelector("main").append(host)
  const untrack = observer.track(host)
  assert.equal(host.classList.contains("dark"), false)
  document.body.className = "dim"
  await settle()
  assert.equal(host.classList.contains("dark"), true)
  document.body.style.backgroundColor = "white"
  await settle()
  assert.equal(host.classList.contains("dark"), false)
  document.body.style.backgroundColor = ""
  document.body.className = ""
  document.querySelector("style").textContent =
    "body { background: transparent; } html.night { background: black; }"
  document.documentElement.className = "night"
  await settle()
  assert.equal(host.classList.contains("dark"), true)
  assert.equal(
    document.body.className,
    "",
    "the observer changes only its own host"
  )
  untrack()
  document.documentElement.className = ""
  await settle()
  assert.equal(
    host.classList.contains("dark"),
    true,
    "unmounted hosts are no longer retained"
  )
  observer.dispose()
  dom.window.close()
})

test("unrelated timeline and control mutations do not repeatedly compute page styles", async () => {
  const dom = page()
  const document = dom.window.document
  document.body.style.backgroundColor = "white"
  let reads = 0
  const getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  dom.window.getComputedStyle = (...args) => {
    reads += 1
    return getComputedStyle(...args)
  }
  const observer = observePageTheme(document)
  const initialReads = reads
  const column = document.querySelector('[data-testid="primaryColumn"]')
  for (let index = 0; index < 20; index += 1) {
    const post = document.createElement("article")
    column.append(post)
    post.className = "timeline-post"
    post.style.backgroundColor = "white"
    const host = document.createElement("span")
    host.setAttribute("data-docmrk-feedback", "")
    post.append(host)
    observer.track(host)
  }
  await settle()
  assert.equal(reads, initialReads)
  const replacement = document.createElement("main")
  replacement.setAttribute("role", "main")
  replacement.style.backgroundColor = "black"
  document.querySelector("main").replaceWith(replacement)
  await settle()
  assert.equal(
    reads > initialReads,
    true,
    "SPA surface replacement is reevaluated"
  )
  observer.dispose()
  dom.window.close()
})

test("system fallback updates, while disposal removes listeners and pending theme work", async () => {
  const dom = page()
  const document = dom.window.document
  const preference = mediaPreference(dom.window, true)
  const observer = observePageTheme(document)
  const host = document.createElement("span")
  observer.track(host)
  assert.equal(host.classList.contains("dark"), true)
  preference.set(false)
  await settle()
  assert.equal(host.classList.contains("dark"), false)
  document.body.style.backgroundColor = "black"
  await Promise.resolve()
  observer.dispose()
  preference.set(true)
  await settle()
  assert.equal(preference.listeners.size, 0)
  assert.equal(host.classList.contains("dark"), false)
  observer.refresh()
  assert.equal(host.classList.contains("dark"), false)
  dom.window.close()
})
