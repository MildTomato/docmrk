import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  //   const message = await querySomeApi(req.body.id)
  console.log("ping")

  console.log(req.body)
  res.send({
    message: "done"
  })
}

export default handler
