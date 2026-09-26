import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  res.send({
    data: null,
    error: {
      code: "INVALID_REQUEST",
      message:
        "Sign in through Docmrk settings. Sessions are managed by the extension background worker."
    }
  })
}

export default handler
