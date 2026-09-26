import { type MessageName, sendToBackground } from "@plasmohq/messaging"

import type { Result } from "./contracts"

export async function requestBackground<T>(
  name: string,
  body?: unknown,
  timeoutMs = 15000
): Promise<Result<T>> {
  let timer: ReturnType<typeof setTimeout>
  try {
    const response = await Promise.race([
      sendToBackground<unknown, Result<T>>({ name: name as MessageName, body }),
      new Promise<Result<T>>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              data: null,
              error: {
                code: "NETWORK",
                message:
                  "Docmrk took too long to respond. Check your connection and try again."
              }
            }),
          timeoutMs
        )
      })
    ])
    if (!response || !("data" in response) || !("error" in response)) {
      throw new Error("Invalid extension response")
    }
    return response
  } catch {
    return {
      data: null,
      error: {
        code: "NETWORK",
        message: "Docmrk could not connect. Reload this page and try again."
      }
    }
  } finally {
    clearTimeout(timer)
  }
}
