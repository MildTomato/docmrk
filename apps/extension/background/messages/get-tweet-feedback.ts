import type { PlasmoMessaging } from "@plasmohq/messaging"

import { supabase } from "~core/supabase"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  console.log(req.body.id)

  const { data, error } = await supabase.from("feedback").select()

  //   console.log({ data, error })

  if (error) {
    console.error(error)
    return res.send({ error })
  }

  res.send({ data, error })
}

export default handler
