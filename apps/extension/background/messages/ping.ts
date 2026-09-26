import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  res.send({ data: { ready: true }, error: null })
}

export default handler
