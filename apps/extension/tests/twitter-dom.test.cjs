const assert = require("node:assert/strict")
const { test } = require("node:test")
const path = require("node:path")
const Module = require("node:module")
const { buildSync } = require("esbuild")
const { JSDOM } = require("jsdom")

const filename = path.resolve(__dirname, "../core/twitter-dom.ts")
const compiled = buildSync({
  entryPoints: [filename],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false
}).outputFiles[0].text
const source = new Module(filename, module)
source._compile(compiled, filename)
const { parseTweetUrl, readTweet, observeTweets } = source.exports

function article(
  id = "123",
  body = '<div data-testid="tweetText">Outer post</div>'
) {
  return `<article data-testid="tweet"><div data-testid="User-Name"><a href="/alice/status/${id}?s=20"><time>Today</time></a></div>${body}</article>`
}
function page(html) {
  return new JSDOM(html, { url: "https://x.com/home" })
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 90))

test("permalink parsing keeps numeric status IDs with media suffixes and queries", () => {
  assert.deepEqual(
    parseTweetUrl("https://twitter.com/alice/status/123/photo/1?s=20"),
    {
      identifier_id: "123",
      author: "alice",
      url: "https://x.com/alice/status/123"
    }
  )
  for (const href of [
    "https://evil.example/alice/status/123",
    "/alice/status/not-an-id",
    "/i/ads/123",
    "javascript:alert(1)",
    "/alice/status/123abc"
  ]) {
    assert.equal(parseTweetUrl(href), null, href)
  }
})

test("quote timestamps and text never become the outer post's identity", () => {
  const quoted = `<div role="link" tabindex="0"><div data-testid="User-Name"><a href="/quoted/status/999"><time>Yesterday</time></a></div><div data-testid="tweetText">Quoted text</div></div>`
  const dom = page(
    `<article data-testid="tweet">${quoted}<div data-testid="User-Name">Alice</div><div data-testid="tweetText">Outer text</div><a href="/alice/status/123"><time>Today</time></a></article>`
  )
  const details = readTweet(dom.window.document.querySelector("article"))
  assert.equal(details.identifier_id, "123")
  assert.equal(details.metadata.tweetText, "Outer text")
  assert.equal(details.metadata.author, "alice")
  dom.window.close()
})

test("detail views and image-only posts work without text or a header timestamp", () => {
  const dom = page(
    `<article data-testid="tweet"><div data-testid="User-Name">Alice</div><a href="/alice/status/123/photo/1"><img></a><div><a href="/alice/status/123"><time>Today</time></a></div></article>`
  )
  assert.deepEqual(readTweet(dom.window.document.querySelector("article")), {
    identifier_id: "123",
    metadata: {
      tweetText: "",
      author: "alice",
      url: "https://x.com/alice/status/123"
    }
  })
  dom.window.close()
})

test("invalid, quote-only, and promoted articles are skipped", () => {
  const dom = page(
    `${article("not-numeric")}${article(
      "123",
      '<span data-testid="promotedIndicator">Ad</span>'
    )}<article data-testid="tweet"><div role="link"><a href="/quoted/status/999"><time>Today</time></a></div></article>`
  )
  for (const element of dom.window.document.querySelectorAll("article"))
    assert.equal(readTweet(element), null)
  dom.window.close()
})

test("ordinary video posts remain capturable inside placement tracking wrappers", () => {
  const dom = page(
    `<div data-testid="placementTracking">${article(
      "2103601794270015996",
      '<div data-testid="tweetText">An ordinary video post</div><div data-testid="placementTracking"><div data-testid="videoPlayer"><video></video></div></div>'
    )}</div>`
  )
  const details = readTweet(dom.window.document.querySelector("article"))
  assert.equal(details.identifier_id, "2103601794270015996")
  assert.equal(details.metadata.tweetText, "An ordinary video post")
  const ids = []
  const observer = observeTweets(dom.window.document, (host, tweet) => {
    ids.push(tweet.identifier_id)
    return { update() {}, dispose() {} }
  })
  assert.deepEqual(ids, ["2103601794270015996"])
  assert.equal(
    dom.window.document.querySelectorAll("[data-docmrk-feedback]").length,
    1
  )
  observer.dispose()
  dom.window.close()
})

test("mounts one control for an outer post with nested quoted articles", async () => {
  const dom = page(article("123", article("999")))
  const ids = []
  const observer = observeTweets(dom.window.document, (host, tweet) => {
    ids.push(tweet.identifier_id)
    return { update() {}, dispose() {} }
  })
  await settle()
  assert.deepEqual(ids, ["123"])
  assert.equal(
    dom.window.document.querySelectorAll("[data-docmrk-feedback]").length,
    1
  )
  observer.dispose()
  dom.window.close()
})

test("SPA additions, recycled posts, metadata updates, and removals are handled without scrolling", async () => {
  const dom = page("<main></main>")
  const document = dom.window.document
  const mounts = [],
    updates = [],
    disposed = []
  const observer = observeTweets(document, (host, tweet) => {
    mounts.push(tweet.identifier_id)
    return {
      update: (next) => updates.push(next),
      dispose: () => disposed.push(tweet.identifier_id)
    }
  })
  document.querySelector("main").innerHTML = article()
  await settle()
  assert.deepEqual(mounts, ["123"])
  document.body.append(document.createElement("aside"))
  await settle()
  assert.equal(mounts.length, 1)
  assert.equal(updates.length, 0)

  const tweet = document.querySelector("article")
  tweet.querySelector("a").href = "/bob/status/456"
  tweet.querySelector('[data-testid="tweetText"]').textContent = "Updated post"
  await settle()
  assert.equal(mounts.length, 1)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].identifier_id, "456")
  assert.equal(updates[0].metadata.tweetText, "Updated post")
  observer.refresh()
  assert.equal(updates.length, 2)
  tweet.remove()
  await settle()
  assert.deepEqual(disposed, ["123"])
  observer.dispose()
  document.querySelector("main").innerHTML = article("777")
  await settle()
  assert.equal(mounts.length, 1)
  dom.window.close()
})

test("removed hosts are cleaned up and remounted once; disposal cancels pending scans", async () => {
  const dom = page(article())
  let mounts = 0,
    disposed = 0
  const observer = observeTweets(dom.window.document, () => {
    mounts += 1
    return {
      update() {},
      dispose: () => {
        disposed += 1
      }
    }
  })
  dom.window.document.querySelector("[data-docmrk-feedback]").remove()
  await settle()
  assert.equal(mounts, 2)
  assert.equal(disposed, 1)
  dom.window.document.body.insertAdjacentHTML("beforeend", article("456"))
  observer.dispose()
  await settle()
  assert.equal(mounts, 2)
  assert.equal(disposed, 2)
  assert.equal(
    dom.window.document.querySelectorAll("[data-docmrk-feedback]").length,
    0
  )
  dom.window.close()
})
