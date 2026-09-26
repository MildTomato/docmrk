const assert = require("node:assert/strict")
const { test } = require("node:test")
const Module = require("node:module")
const path = require("node:path")
const { buildSync } = require("esbuild")

const filename = path.join(__dirname, "../core/messaging.ts")
const { outputFiles } = buildSync({
  entryPoints: [filename],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["@plasmohq/messaging"]
})

function messaging(sendToBackground) {
  const module = new Module(filename, moduleParent)
  module.require = () => ({ sendToBackground })
  module._compile(outputFiles[0].text, filename)
  return module.exports.requestBackground
}
const moduleParent = module

test("internal messages use this extension and preserve the response", async () => {
  const expected = { data: { id: 1 }, error: null }
  const request = messaging(async (message) => {
    assert.deepEqual(message, {
      name: "get-tweet-feedback",
      body: { identifier_id: "123" }
    })
    return expected
  })
  assert.deepEqual(
    await request("get-tweet-feedback", { identifier_id: "123" }),
    expected
  )
})

test("a missing background worker produces an actionable error", async () => {
  const request = messaging(async () => {
    throw new Error("Extension context invalidated")
  })
  const response = await request("account")
  assert.equal(response.data, null)
  assert.equal(response.error.code, "NETWORK")
  assert.match(response.error.message, /Reload/)
})

test("an unresponsive worker does not leave the UI pending indefinitely", async () => {
  const request = messaging(() => new Promise(() => {}))
  const response = await request("account", undefined, 10)
  assert.equal(response.error.code, "NETWORK")
  assert.match(response.error.message, /too long/)
})

test("malformed responses cannot be mistaken for a successful save", async () => {
  for (const value of [undefined, null, {}, { success: true }]) {
    const request = messaging(async () => value)
    assert.equal((await request("post-tweet-feedback")).error.code, "NETWORK")
  }
})
