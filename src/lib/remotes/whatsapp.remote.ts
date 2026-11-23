import { command } from "$app/server"
import * as env from '$app/env/private';
import { type } from "arktype"

export const sendMessage = command(type({ recipient: 'string', payload: 'object' }), async ({ recipient, payload }) => {
  try {
    await fetch(env.WHATSAPP_HOST + '/api/v1/send', {
      method: 'POST',
      headers: {
        'Authorization': env.WHATSAPP_AUTH,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient,
        payload,
      })
    })
    return true
  } catch (err) {
    console.log(err)
    return false
  }

})