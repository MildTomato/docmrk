import cssText from "data-text:~content-style.css"
import type { PlasmoCSConfig } from "plasmo"
import { createElement } from "react"
import { createRoot } from "react-dom/client"

import { FeedbackDiv } from "~components/feedback-div"
import { CONTEXT_CHANGED_KEY } from "~core/contracts"
import { observePageTheme } from "~core/page-theme"
import { observeTweets } from "~core/twitter-dom"

export const config: PlasmoCSConfig = {
  matches: [
    "https://x.com/*",
    "https://www.x.com/*",
    "https://twitter.com/*",
    "https://www.twitter.com/*"
  ]
}

let contextVersion = 0
const theme = observePageTheme(document)
const tweets = observeTweets(document, (host, tweet) => {
  const untrackTheme = theme.track(host)
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = cssText
  const container = document.createElement("span")
  shadow.append(style, container)
  const root = createRoot(container)
  const update = (details: typeof tweet) => {
    root.render(createElement(FeedbackDiv, { tweet: details, contextVersion }))
  }
  update(tweet)
  return {
    update,
    dispose: () => {
      untrackTheme()
      root.unmount()
    }
  }
})

const onContextChanged = (
  changes: { [key: string]: chrome.storage.StorageChange },
  area: string
) => {
  if (area === "local" && changes[CONTEXT_CHANGED_KEY]) {
    contextVersion += 1
    tweets.refresh()
  }
}
chrome.storage.onChanged.addListener(onContextChanged)

const onPageShow = (event: PageTransitionEvent) => {
  if (event.persisted) {
    theme.refresh()
    contextVersion += 1
    tweets.refresh()
  }
}

const onPageHide = (event: PageTransitionEvent) => {
  if (!event.persisted) {
    tweets.dispose()
    theme.dispose()
    chrome.storage.onChanged.removeListener(onContextChanged)
    window.removeEventListener("pageshow", onPageShow)
    window.removeEventListener("pagehide", onPageHide)
  }
}
window.addEventListener("pageshow", onPageShow)
window.addEventListener("pagehide", onPageHide)
