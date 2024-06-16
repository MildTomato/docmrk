import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect } from "react"
import { createRoot } from "react-dom/client"

import { sendToBackground } from "@plasmohq/messaging"

// import { sendToBackground } from "@plasmohq/messaging"

// import { supabase } from "~core/supabase"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*"],
  all_frames: true
}

const FeedbackDiv = () => {
  return (
    <button
      className="feedback-logged"
      style={{
        backgroundColor: "#333",
        position: "relative",
        border: "1px solid #fff",
        padding: "4px 8px",
        borderRadius: "96px",
        fontFamily: '"Helvetica", "Sans-Serif", "Arial"',
        fontSize: "11px",
        color: "white",
        marginTop: "16px",
        marginBottom: "16px",
        width: "fit-content",
        display: "flex",
        gap: "4px",
        alignItems: "center"
      }}>
      {/* <div
        style={{
          width: "16px",
          height: "16px"
        }}> */}
      {/* <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-6">
          <path
            fillRule="evenodd"
            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
            clipRule="evenodd"
          />
        </svg> */}
      {/* </div> */}
      Log as feedback
    </button>
  )
}

function Cat() {
  console.log("twitter.ts content ")

  useEffect(() => {
    async function send() {
      const resp = await sendToBackground({
        name: "ping",
        body: {
          id: "i am in the twitter.ts file"
        },
        extensionId: "djfiahgkbkldjjipdlfklbcjdcckdfih" // find this in chrome's extension manager
      })
    }

    send()
  }, [])

  const addFeedbackDiv = useCallback(() => {
    const anchors = document.querySelectorAll(
      `[data-testid="tweet"] [data-testid="tweetText"]`
    )

    anchors.forEach((anchor) => {
      if (!anchor.querySelector(".feedback-logged")) {
        const container = document.createElement("div")
        const root = createRoot(container)
        root.render(<FeedbackDiv />)
        anchor.appendChild(container)
      }
    })
  }, [])

  const checkForTweets = useCallback(() => {
    if (
      document.querySelector(`[data-testid="tweet"] [data-testid="tweetText"]`)
    ) {
      addFeedbackDiv()
    } else {
      requestAnimationFrame(checkForTweets)
    }
  }, [addFeedbackDiv])

  useEffect(() => {
    // Check for tweets initially when the page loads
    setTimeout(() => requestAnimationFrame(checkForTweets), 100)

    // Set up a scroll event listener
    let scrollTimeout: NodeJS.Timeout

    const handleScroll = () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }

      scrollTimeout = setTimeout(() => {
        addFeedbackDiv()
      }, 100) // Run the function after the user stops scrolling for 100ms
    }

    window.addEventListener("scroll", handleScroll)

    // Clean up the event listener on component unmount
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [addFeedbackDiv, checkForTweets])

  return null
}

export default Cat
