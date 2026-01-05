import { command, form, getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";
import { Logger } from "$lib/server/log";
import { FileStorage } from "$lib/server/storage";
import { base64ToBlob, calculateFileChecksum } from "$lib/utils";
import { type } from "arktype";
import dayjs from "dayjs";
import { sql } from "drizzle-orm";
import { Esign } from "../server/plugins/esign";
import { validateTurnstile } from "$lib/server/plugins/turnstile";

const storage = new FileStorage;
const logger = new Logger;
const esign = new Esign;

export const checkUser = command(type({
  email: 'string.email?',
  nik: 'string?',
}), async (props) => {
  const response = await esign.checkUser(props);
  const user = await db.query.signers.findFirst({
    where: {
      OR: [{
        email: props.email,
      }, {
        email: props.nik,
      }]
    }
  })

  response.data.user = user;
  return response.data
})


export const verifyTurnstile = command(type({
  __token: 'string',
}), async (props) => {
  const event = getRequestEvent();
  await validateTurnstile(props.__token, event.getClientAddress());
  return { success: true }
})
export const signDocument = command(type({
  // __token: 'string',
  __manual: 'boolean?',
  __asDraft: 'boolean?',
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
    // Validate Turnstile
    // const event = getRequestEvent();
    // await validateTurnstile(props.__token, event.getClientAddress());

    // const { fileBase64, fileName, __token, ...metadata } = props;
    // console.log(metadata);
    let response: {
      status: number,
      data: any,
    };

    if (props.__manual) {
      response = {
        status: 200,
        data: {
          file: [props.fileBase64],
        },
      }
    } else if (props.__asDraft) {
      response = {
        status: 200,
        data: {
          file: [props.fileBase64],
        },
      }
    } else {
      response = await esign.signPDF(props);
      if (response.status >= 500) {
        return {
          message: '[Sign Document Error] Retry Signing',
        }
      }
      if (response.data.error) {
        await logger.log('error', response.data.error, {
          email: props.email,
          nik: props.nik,
          note: props.note,
          fileName: props.fileName,
        })
        if (response.data?.error_description) {
          response.data.error += '\n' + response.data?.error_description;
        }
        return response.data;
      }
    }

    if (response.data.file && response.data.file.length > 0) {
      const blob = base64ToBlob(response.data.file[0]);
      const buffer = Buffer.from(await blob.arrayBuffer());
      const checksum = await calculateFileChecksum(buffer);
      const saved = await storage.save(`documents/${props.__asDraft ? 'draft_' : 'signed_'}${props.fileName}`, buffer);

      if (saved.url) {
        // const { fileBase64, fileName, ...metadata } = props
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
            title: props.fileName,
            files: [saved.url],
            checksums: [checksum],
            status: props.__asDraft ? 'draft' : 'signed',
            esign: !props.__manual,
            signatureProperties: props.__asDraft ? props.signatureProperties : null,
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
      }
    }
    return response.data;
  } catch (err) {
    //@ts-expect-error
    return { error: '[Server Esign Error] ' + err?.message + '.\nHarap mencoba lagi dalam beberapa saat' }
  }
})

export const verifyDocument = command(type({
  file: 'string',
}), async (props) => {
  try {
    const response = await esign.verifyPDF(props)

    if (response.status == 200) {
      await db.query.documentStatistics.upsert({
        data: {
          date: dayjs().format('YYYY-MM-DD'),
          verified: 1,
        },
        update: stat => ({
          verified: sql`${stat.verified} + 1`,
        })
      })
      return response.data;
    }

  } catch { }

  return {
    conclusion: 'Error',
    description: '[Esign Server Error] Failed to verify document',
  }
})


export const getDocument = query(type({
  id: 'string',
  checksum: 'string?',
}), async (props) => {
  const document = await db.query.documents.findMany({
    where: {
      OR: [
        {
          checksums: {
            arrayContains: [props.checksum || '-'],
          }
        },
        {
          id: {
            in: props.id.split(','),
          }
        }
      ]
    }
  })
  return document;
})

export const getTemplates = query('unchecked', async () => {
  const templates = await db.query.templates.findMany();
  return templates;
})