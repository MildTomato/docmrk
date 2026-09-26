import type { PlasmoMessaging } from "@plasmohq/messaging"

import { backgroundService } from "~core/background-service"

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  res.send(await backgroundService.account({ action: "get" }))
}

export default handler
