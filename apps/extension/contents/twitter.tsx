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

const FeedbackDiv = ({ id, data }: { id: string; data: any }) => {
  async function handleClick() {
    const resp = await sendToBackground({
      name: "ping",
      body: {
        id: "i am in the twitter.ts file"
      },
      extensionId: "djfiahgkbkldjjipdlfklbcjdcckdfih" // find this in chrome's extension manager
    })
  }

  return (
    <button
      onClick={async () => await handleClick()}
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
        // marginTop: "16px",
        // marginBottom: "16px",
        marginLeft: "8px",
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
      Log as feedback {id} <span style={{ color: "red" }}>{data}</span>
    </button>
  )
}

async function send({ body }: { body: any }) {
  const resp = await sendToBackground({
    name: "get-tweet-feedback",
    body: body,
    extensionId: "djfiahgkbkldjjipdlfklbcjdcckdfih" // find this in chrome's extension manager
  })

  return resp
}

function Cat() {
  console.log("twitter.ts content ")

  // useEffect(() => {
  //   async function send() {
  //     const resp = await sendToBackground({
  //       name: "ping",
  //       body: {
  //         id: "i am in the twitter.ts file"
  //       },
  //       extensionId: "djfiahgkbkldjjipdlfklbcjdcckdfih" // find this in chrome's extension manager
  //     })
  //   }

  //   send()
  // }, [])

  const addFeedbackDiv = useCallback(() => {
    const anchors = document.querySelectorAll(
      `[data-testid="tweet"] [data-testid="User-Name"]`
      // `[data-testid="tweet"] [data-testid="tweetText"]`
    )

    anchors.forEach(async (anchor) => {
      try {
        // console.log(anchor)

        // find in anchor variable a anchor tag and extract the href, which looks like /username/status/id-of-numbers
        // IT IS NOT THE FIRST ANCHOR TAG, IT IS THE SECOND ONE
        // we need the number id
        const tweetElement = anchor.closest('[data-testid="tweet"]')

        let id = null

        // Extract the ID from the link
        const linkWithId = tweetElement.querySelector('a[href*="/status/"]')
        if (linkWithId) {
          const href = linkWithId.getAttribute("href")
          id = href.split("/").pop()
          // console.log(`ID: ${id}`)
        }

        // Extract the tweet text
        const tweetTextElement = tweetElement.querySelector(
          '[data-testid="tweetText"]'
        )

        let tweetText = null

        if (tweetTextElement) {
          tweetText = tweetTextElement.textContent
          // console.log(`Tweet Text: ${tweetText}`)
        }

        const resp = await sendToBackground({
          name: "get-tweet-feedback",
          body: { id: id, tweetText: tweetText },
          extensionId: "djfiahgkbkldjjipdlfklbcjdcckdfih" // find this in chrome's extension manager
        })
        // console.log("resp has finished")
        // console.log("send resp", resp.data)

        /**
         * Found a tweet, but the feedback div is not already present
         */
        if (!anchor.querySelector(".feedback-logged")) {
          // console.log("Inserting button ", id)
          // create div
          const container = document.createElement("div")
          const root = createRoot(container)

          // render the div
          root.render(<FeedbackDiv id={id} data={resp.data[1].status} />)
          anchor.appendChild(container)
        }
      } catch (error) {
        console.error("ERROR", error)
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
      }, 500) // Run the function after the user stops scrolling for 100ms
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
