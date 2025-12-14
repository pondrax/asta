import { command, form } from "$app/server";
import { env } from "$env/dynamic/private";
import { db } from "$lib/server/db";
import { Logger } from "$lib/server/log";
import { FileStorage } from "$lib/server/storage";
import { base64ToBlob, calculateFileChecksum } from "$lib/utils";
import { type } from "arktype";
import { desc, sql } from "drizzle-orm";

const storage = new FileStorage;
const logger = new Logger;

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
  fileBase64: 'string',
  fileName: 'string'
}), async (props) => {
  if (props.signatureProperties.length === 0) {
    props.signatureProperties.push({
      "tampilan": "INVISIBLE",
    })
  }
  // return {}
  // console.log(props)
  // return {}
  const req = await fetch(`${env.ESIGN_URL}/api/v2/sign/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.ESIGN_API_KEY,
    },
    body: JSON.stringify({
      ...props,
      file: [props.fileBase64],
    }),
  });


  const response = await req.json();
  if (response.error) {
    await logger.log('error', response.error, {
      email: props.email,
      note: props.note,
      fileName: props.fileName,
    })
    return response;
  }

  if (response.file && response.file.length > 0) {
    const blob = base64ToBlob(response.file[0]);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const checksum = await calculateFileChecksum(buffer);
    const saved = await storage.save('documents/' + props.fileName, buffer);
    if (saved.url) {
      const { fileBase64, fileName, ...metadata } = props
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
          owner: props.email,
          signer: props.email,
          title: props.note,
          files: [saved.url],
          checksums: [checksum],
          metadata: null
          // metadata: JSON.stringify(metadata),
        },
        update: doc => ({
          files: sql`array_append(${doc.files}, ${saved.url})`,
          checksums: sql`array_append(${doc.checksums}, ${checksum})`,
        })
      })
      console.log(saved)
    }
  }

  return response;
})

export const verifyDocument = command(type({
  file: 'string',
}), async (props) => {
  const req = await fetch(`${env.ESIGN_VERIFY_URL}/api/v2/verify/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.ESIGN_VERIFY_KEY,
    },
    body: JSON.stringify(props),
  });

  // console.log(req.status)
  if (req.status == 200) {
    return await req.json();
  }
  return {
    conclusion: 'Error',
    description: 'Server Error, Failed to verify document',
  }

})


export const getDocument = command(type({
  id: 'string',
}), async (props) => {
  const document = await db.query.documents.findFirst({
    where: {
      id: props.id,
    }
  })
  return document;
})
