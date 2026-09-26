import { useCallback, useEffect, useRef, useState } from "react"
import type { MouseEvent } from "react"
import { Button } from "ui/components/button"

import type { ExtensionError, Feedback } from "~core/contracts"
import { requestBackground } from "~core/messaging"
import type { TweetDetails } from "~core/twitter-dom"

type State =
  | { status: "checking" | "ready" | "saving" }
  | { status: "saved"; feedback: Feedback }
  | { status: "error"; error: ExtensionError }

const savedListeners = new Map<string, Set<(feedback: Feedback) => void>>()

export function FeedbackDiv({
  tweet,
  contextVersion
}: {
  tweet: TweetDetails
  contextVersion: number
}) {
  const [state, setState] = useState<State>({ status: "checking" })
  const requestVersion = useRef(0)
  const busy = useRef(false)
  const id = tweet.identifier_id
  const contextKey = `${contextVersion}:${id}`

  const check = useCallback(async () => {
    const version = ++requestVersion.current
    busy.current = true
    setState({ status: "checking" })
    const result = await requestBackground<Feedback>("get-tweet-feedback", {
      identifier_id: id
    })
    if (version !== requestVersion.current) return
    busy.current = false
    setState(
      result.error
        ? { status: "error", error: result.error }
        : result.data
        ? { status: "saved", feedback: result.data }
        : { status: "ready" }
    )
  }, [id, contextVersion])

  useEffect(() => {
    const onSaved = (feedback: Feedback) => {
      requestVersion.current += 1
      busy.current = false
      setState({ status: "saved", feedback })
    }
    const listeners = savedListeners.get(contextKey) || new Set()
    listeners.add(onSaved)
    savedListeners.set(contextKey, listeners)
    void check()
    return () => {
      requestVersion.current += 1
      listeners.delete(onSaved)
      if (listeners.size === 0) savedListeners.delete(contextKey)
    }
  }, [check, contextKey])

  const setupRequired =
    state.status === "error" &&
    ["AUTH_REQUIRED", "ORGANIZATION_REQUIRED", "FORBIDDEN"].includes(
      state.error.code
    )

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (busy.current || state.status === "saved") return
    if (setupRequired) {
      const version = requestVersion.current
      const result = await requestBackground<null>("open-options")
      if (result.error && version === requestVersion.current)
        setState({ status: "error", error: result.error })
      return
    }
    if (state.status === "error") {
      // A timed-out save may have succeeded. Check before allowing another.
      await check()
      return
    }
    if (state.status !== "ready") return
    busy.current = true
    const version = ++requestVersion.current
    setState({ status: "saving" })
    const result = await requestBackground<Feedback>(
      "post-tweet-feedback",
      tweet
    )
    if (version !== requestVersion.current) return
    busy.current = false
    if (result.error || !result.data) {
      setState({
        status: "error",
        error: result.error || {
          code: "UNKNOWN",
          message: "Could not confirm the save. Check again before retrying."
        }
      })
      return
    }
    for (const listener of savedListeners.get(contextKey) || [])
      listener(result.data)
  }

  const label =
    state.status === "checking"
      ? "Checking…"
      : state.status === "saving"
      ? "Saving…"
      : state.status === "saved"
      ? "✓ Saved to Docmrk"
      : state.status === "error"
      ? state.error.code === "AUTH_REQUIRED"
        ? "Sign in to save"
        : state.error.code === "ORGANIZATION_REQUIRED"
        ? "Choose organization"
        : setupRequired
        ? "Open setup"
        : "Retry check"
      : "Save to Docmrk"
  const disabled =
    state.status === "checking" ||
    state.status === "saving" ||
    state.status === "saved"
  const title =
    state.status === "saved"
      ? `Saved${
          state.feedback.status
            ? ` · ${state.feedback.status.replaceAll("_", " ")}`
            : ""
        }`
      : state.status === "error"
      ? state.error.message
      : "Save this post as feedback in your selected Docmrk organization"

  return (
    <span
      className="inline-flex max-w-full flex-col items-start gap-1 font-sans text-foreground"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}>
      <Button
        type="button"
        variant={state.status === "saved" ? "secondary" : "outline"}
        size="sm"
        className="feedback-logged h-7 whitespace-nowrap px-2.5"
        disabled={disabled}
        onClick={handleClick}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        title={title}
        aria-label={`${label}. ${title}`}
        aria-busy={state.status === "checking" || state.status === "saving"}>
        {label}
      </Button>
      {state.status === "error" && !setupRequired && (
        <span
          role="alert"
          className="max-w-full whitespace-normal rounded-md border border-destructive/30 bg-background px-2 py-1 text-xs leading-snug text-destructive">
          {state.error.message}
        </span>
      )}
    </span>
  )
}
