import { command, form } from "$app/server";
import { env } from "$env/dynamic/private";
import { db } from "$lib/server/db";
import { FileStorage } from "$lib/server/storage";
import { base64ToBlob } from "$lib/utils";
import { type } from "arktype";

const storage = new FileStorage;
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
  id: 'string',
  email: 'string.email',
  nama: 'string',
  jabatan: 'string',
  pangkat: 'string',
  instansi: 'string',
  passphrase: 'string',
  signatureProperties: 'Array',
  note: 'string',
  file: 'Array'
}), async (props) => {
  if (props.signatureProperties.length === 0) {
    props.signatureProperties.push({
      "tampilan": "INVISIBLE",
    })
  }
  // console.log(props)
  const req = await fetch(`${env.ESIGN_URL}/api/v2/sign/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.ESIGN_API_KEY,
    },
    body: JSON.stringify(props),
  });

  const response = await req.json();
  if (response.file && response.file.length > 0) {

    const blob = base64ToBlob(response.file[0]);
    const saved = await storage.save('test.pdf', Buffer.from(await blob.arrayBuffer()));
    if (saved.url) {

      await db.query.signers.upsert({
        data: {
          email: props.email,
          name: props.nama,
          rank: props.pangkat,
          organizations: props.instansi,
          position: props.jabatan,
        }
      })
      await db.query.documents.upsert({
        data: {
          id: props.id,
          email: props.email,
          title: props.note,
          files: [saved.url],
          // rank: props.pangkat,
          // organizations: props.instansi,
          // position: props.jabatan,
          // file: [saved.url],
        }
      })
      console.log(saved)
    }
  }
  return response;
})