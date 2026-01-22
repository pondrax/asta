import { command } from "$app/server"
import { WHATSAPP_AUTH, WHATSAPP_HOST } from "$env/static/private"
import { type } from "arktype"

// export async function sendMessage({ recipient, payload }: { recipient: string, payload: any }) {
//   try {

//     const response = await fetch(WHATSAPP_HOST + '/api/v1/send', {
//       method: 'POST',
//       headers: {
//         'Authorization': WHATSAPP_AUTH,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         recipient,
//         payload,
//       })
//     })
//     return response
//   } catch (err) {
//     console.log(err)
//     return false
//   }
// }

export const sendMessage = command(type({ recipient: 'string', payload: 'object' }), async ({ recipient, payload }) => {
  try {
    const response = await fetch(WHATSAPP_HOST + '/api/v1/send', {
      method: 'POST',
      headers: {
        'Authorization': WHATSAPP_AUTH,
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