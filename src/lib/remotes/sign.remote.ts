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

export const checkUser = command(type({
  email: 'string.email?',
  nik: 'string?',
}), async (props) => {
  const req = await fetch(`${env.ESIGN_URL}/api/v2/user/check/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.ESIGN_API_KEY,
    },
    body: JSON.stringify(props),
  });
  const response = await req.json();

  const user = await db.query.signers.findFirst({
    where: {
      OR: [{
        email: props.email,
      }, {
        email: props.nik,
      }]
    }
  })

  response.user = user;
  return response
})

export const signDocument = command(type({
  id: 'string',
  email: 'string?',
  nik: 'string?',
  nama: 'string?',
  jabatan: 'string?',
  pangkat: 'string?',
  instansi: 'string?',
  passphrase: 'string',
  signatureProperties: 'Array',
  location: 'string?',
  note: 'string?',
  fileBase64: 'string',
  fileName: 'string'
}), async (props) => {
  try {
    if (props.signatureProperties.length === 0) {
      props.signatureProperties.push({
        "tampilan": "INVISIBLE",
        "page": 1,
        "originX": 0.0,
        "originY": 0.0,
        "width": 100.0,
        "height": 75.0,
        "location": props.location || "null",
        "reason": props.note || "null",
        "contactInfo": "null"
      })
    }

    const req = await fetch(`${env.ESIGN_URL}/api/v2/sign/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": env.ESIGN_API_KEY,
      },
      body: JSON.stringify({
        email: props.email,
        nik: props.nik,
        passphrase: props.passphrase,
        signatureProperties: props.signatureProperties,
        file: [props.fileBase64]
      }),
      redirect: "follow"
    });


    const contentType = req.headers.get("content-type");

    if (contentType && contentType.includes("text/html")) {
      const htmlText = await req.text();
      return {
        erro: '[Server Error]' + htmlText,
      }
    }
    const response = await req.json();
    if (req.status >= 500) {
      return {
        message: 'Internal Server Error',
      }
    }
    if (response.error) {
      await logger.log('error', response.error, {
        email: props.email,
        nik: props.nik,
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
            nik: props.nik,
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

        await db.query.documentStatistics.upsert({
          data: {
            date: dayjs().format('YYYY-MM-DD'),
            signed: 1,
          },
          update: stat => ({
            signed: sql`${stat.signed} + 1`,
          })
        })
        // console.log(saved)
      }
    }

    return response;
  } catch (err) {
    return {
      //@ts-expect-error
      error: '[Server Error] ' + err?.message,
    }
  }
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
