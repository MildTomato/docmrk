import type { TweetRequest } from "./contracts"

export type TweetDetails = Required<TweetRequest>

const TWEET_SELECTOR = '[data-testid="tweet"]'
const HOST_ATTRIBUTE = "data-docmrk-feedback"
const ALLOWED_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com"
])

export function parseTweetUrl(href: string, baseUrl = "https://x.com") {
  try {
    const url = new URL(href, baseUrl)
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname))
      return null
    const match = url.pathname.match(
      /^\/([A-Za-z0-9_]+)\/status\/(\d+)(?:\/|$)/
    )
    if (!match) return null
    return {
      identifier_id: match[2],
      author: match[1],
      url: `https://x.com/${match[1]}/status/${match[2]}`
    }
  } catch {
    return null
  }
}

// Quoted posts may repeat the same test IDs without having their own article.
function belongsToTweet(element: Element, tweet: Element) {
  if (element.closest(TWEET_SELECTOR) !== tweet) return false
  for (
    let parent = element.parentElement;
    parent && parent !== tweet;
    parent = parent.parentElement
  ) {
    if (
      (parent.getAttribute("role") === "link" && parent.tagName !== "A") ||
      parent.matches('[data-testid="quoteTweet"], [data-testid="card.wrapper"]')
    )
      return false
  }
  return true
}

export function readTweet(tweet: Element): TweetDetails | null {
  // The outer article is the actionable post. Do not add a second control to
  // quoted articles or mistake their author/text for the surrounding post.
  if (tweet.parentElement?.closest(TWEET_SELECTOR)) return null
  // placementTracking also wraps ordinary video media; only an explicit ad
  // indicator belonging to this post is a reason to skip it.
  if (
    Array.from(
      tweet.querySelectorAll('[data-testid="promotedIndicator"]')
    ).some((indicator) => belongsToTweet(indicator, tweet))
  )
    return null

  const timestampLinks = Array.from(tweet.querySelectorAll("a[href]")).filter(
    (link) => link.querySelector("time") && belongsToTweet(link, tweet)
  )
  const permalink = timestampLinks
    .map((link) =>
      parseTweetUrl(link.getAttribute("href") || "", tweet.ownerDocument.URL)
    )
    .find(Boolean)
  if (!permalink) return null

  const text = Array.from(
    tweet.querySelectorAll('[data-testid="tweetText"]')
  ).find((element) => belongsToTweet(element, tweet))
  return {
    identifier_id: permalink.identifier_id,
    metadata: {
      tweetText: text?.textContent?.trim() || "",
      url: permalink.url,
      author: permalink.author
    }
  }
}

type MountedTweet = {
  update: (tweet: TweetDetails) => void
  dispose: () => void
}
type MountTweet = (host: HTMLElement, tweet: TweetDetails) => MountedTweet

export function observeTweets(document: Document, mount: MountTweet) {
  const view = document.defaultView
  if (!view) throw new Error("The page is not available.")
  const mounted = new Map<
    Element,
    {
      host: HTMLElement
      details: TweetDetails
      signature: string
      view: MountedTweet
    }
  >()
  let timer: number | undefined
  let stopped = false

  function remove(tweet: Element) {
    const entry = mounted.get(tweet)
    if (!entry) return
    mounted.delete(tweet)
    entry.view.dispose()
    entry.host.remove()
  }

  function scan() {
    timer = undefined
    if (stopped) return
    for (const [tweet, entry] of mounted) {
      if (
        !tweet.isConnected ||
        !entry.host.isConnected ||
        !tweet.contains(entry.host)
      )
        remove(tweet)
    }
    for (const tweet of document.querySelectorAll(TWEET_SELECTOR)) {
      const details = readTweet(tweet)
      if (!details) {
        remove(tweet)
        continue
      }
      const signature = JSON.stringify(details)
      const existing = mounted.get(tweet)
      if (existing) {
        if (signature !== existing.signature) {
          existing.details = details
          existing.signature = signature
          existing.view.update(details)
        }
        continue
      }
      const anchor =
        Array.from(tweet.querySelectorAll('[data-testid="User-Name"]')).find(
          (element) => belongsToTweet(element, tweet)
        ) || tweet
      const host = document.createElement("span")
      host.setAttribute(HOST_ATTRIBUTE, "")
      host.style.cssText =
        "all: initial; display: inline-flex; margin: 4px 0 4px 8px; vertical-align: middle; max-width: 240px;"
      // Claim the position before mounting React or beginning any request.
      anchor.appendChild(host)
      mounted.set(tweet, {
        host,
        details,
        signature,
        view: mount(host, details)
      })
    }
  }

  function schedule() {
    if (!stopped && timer === undefined) timer = view.setTimeout(scan, 50)
  }

  const observer = new view.MutationObserver((changes) => {
    if (
      changes.some((change) => {
        const element =
          change.target.nodeType === 1
            ? (change.target as Element)
            : change.target.parentElement
        return !element?.closest(`[${HOST_ATTRIBUTE}]`)
      })
    )
      schedule()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "data-testid"]
  })
  scan()

  return {
    refresh() {
      for (const entry of mounted.values()) entry.view.update(entry.details)
      schedule()
    },
    dispose() {
      stopped = true
      observer.disconnect()
      if (timer !== undefined) view.clearTimeout(timer)
      for (const tweet of mounted.keys()) remove(tweet)
    }
  }
}
