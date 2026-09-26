import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  try {
    await chrome.runtime.openOptionsPage()
    res.send({ data: { opened: true }, error: null })
  } catch {
    res.send({
      data: null,
      error: {
        code: "UNKNOWN",
        message:
          "Docmrk settings could not open. Open the extension menu and choose Options."
      }
    })
  }
}

export default handler
