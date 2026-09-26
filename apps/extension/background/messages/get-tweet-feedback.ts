import type { PlasmoMessaging } from "@plasmohq/messaging"

import { backgroundService } from "~core/background-service"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  res.send(await backgroundService.getTweet(req.body))
}

export default handler
