import type { PlasmoMessaging } from "@plasmohq/messaging"

import { supabase } from "~core/supabase"

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession()
  if (error) {
    res.send({ error: error.message })
  } else {
    res.send({ session })
  }
}

export default handler
