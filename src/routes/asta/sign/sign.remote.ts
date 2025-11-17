import { command, form } from "$app/server";
import { env } from "$env/dynamic/private";
import { db } from "$lib/server/db";
import { type } from "arktype";

export const checkUser = command(type('string.email'), async (email) => {
  const req = await fetch(`${env.ESIGN_URL}/api/v2/user/check/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.ESIGN_API_KEY,
    },
    body: JSON.stringify({ email }),
  });
  const response = await req.json();

  const user = await db.query.signers.findFirst({
    where: {
      email
    }
  })

  response.user = user;
  return response
})


// {
//   "email": "{{email}}",
//     "passphrase": "{{passphrase}}",
//       "signatureProperties": [
//         {
//           "imageBase64": "{{image_ttd_base64}}",
//           "tampilan": "VISIBLE",
//           "page": 1,
//           "originX": 512.0,
//           "originY": 0.0,
//           "width": 100.0,
//           "height": 75.0,
//           "location": "null",
//           "reason": "null",
//           "contactInfo": "null"
//         }
//       ],
//         "file": [
//           "{{pdf_2_kb}}"
//         ]
// }
export const signDocument = command(type({
  email: 'string.email',
  passphrase: 'string',
  signatureProperties: 'Array',
  file: 'Array'
}), async (props) => {
  if (props.signatureProperties.length === 0) {
    props.signatureProperties.push({
      "tampilan": "INVISIBLE",
    })
  }
  // console.log(props)
  const response = await fetch(`${env.ESIGN_URL}/api/v2/sign/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.ESIGN_API_KEY,
    },
    body: JSON.stringify(props),
  });

  return await response.json();
})