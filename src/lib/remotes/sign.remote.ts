import { command, form, query } from "$app/server";
import { env } from "$env/dynamic/private";
import { db } from "$lib/server/db";
import { Logger } from "$lib/server/log";
import { FileStorage } from "$lib/server/storage";
import { base64ToBlob, calculateFileChecksum } from "$lib/utils";
import { type } from "arktype";
import dayjs from "dayjs";
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
    const saved = await storage.save('documents/signed_' + props.fileName, buffer);
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
          title: fileName,
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

  try {
    const req = await fetch(`${env.ESIGN_VERIFY_URL}/api/v2/verify/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": env.ESIGN_VERIFY_KEY,
      },
      body: JSON.stringify(props),
    });

    if (req.status == 200) {
      await db.query.documentStatistics.upsert({
        data: {
          date: dayjs().format('YYYY-MM-DD'),
          verified: 1,
        },
        update: stat => ({
          verified: sql`${stat.verified} + 1`,
        })
      })
      return await req.json();
    }

    return {
      conclusion: 'Error',
      description: 'Server Error, Failed to verify document',
    }
  } catch (err) {
    return {
      conclusion: 'Error',
      description: 'Server Error, Failed to verify document',
    }
  }
})


export const getDocument = query(type({
  id: 'string',
}), async (props) => {
  const document = await db.query.documents.findMany({
    where: {
      id: {
        in: props.id.split(','),
      }
    }
  })
  return document;
})
