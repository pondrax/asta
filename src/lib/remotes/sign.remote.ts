import { command, getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";
import { Logger } from "$lib/server/log";
import { FileStorage } from "$lib/server/storage";
import { base64ToBlob, calculateFileChecksum, createId } from "$lib/utils";
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

/** Increment today's counter for the given statistic type (creates the row if missing). */
async function bumpStatistic(type: 'signed' | 'verified') {
  const stat = await db.query.documentStatistics.findFirst({
    where: {
      type,
      created: {
        lt: dayjs().endOf('day').toString(),
        gt: dayjs().startOf('day').toString(),
      },
    },
  });

  await db.query.documentStatistics.upsert({
    data: {
      id: stat?.id || createId(),
      type,
      value: 1,
    },
    update: row => ({
      value: sql`${row.value} + 1`,
    }),
  });
}

export const signDocument = command(type({
  __manual: 'boolean?',
  __asDraft: 'boolean?',
  __saveDocument: 'boolean?',
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
  nomor_telepon: 'string?',
  fileBase64: 'string',
  fileName: 'string',
  to: 'string[]|undefined',
}), async (props) => {
  try {
    let response: {
      status: number,
      data: {
        file?: string[];
        error?: string;
        message?: string;
        hint?: string;
        path?: string;
        timestamp?: number;
        error_description?: string;
        retry?: boolean;
      },
    };

    if (props.__manual || props.__asDraft) {
      // Manual signing and drafts skip BSrE — reuse the uploaded file as-is
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
          message: `[Sign Document Error] ${response.data?.message} ${response.data?.hint}`,
          retry: true,
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
          response.data.error += `\n${response.data?.error_description}`;
        }
        return response.data;
      }
    }

    if (response.data.file && response.data.file.length > 0) {
      const history = {
        signer: props.email,
        signedAt: new Date().toISOString(),
        status: 'signed'
      };
      if (props.__saveDocument) {
        const blob = base64ToBlob(response.data.file[0]);
        const buffer = Buffer.from(await blob.arrayBuffer());
        const checksum = await calculateFileChecksum(buffer);
        const saved = await storage.save(`documents/${props.__asDraft ? 'draft_' : 'signed_'}${props.fileName}`, buffer);
        if (saved.url) {
          await db.query.documents.upsert({
            data: {
              id: props.id,
              owner: props.email,
              title: props.fileName,
              files: [saved.url],
              checksums: [checksum],
              esign: !props.__manual,
              to: props.to,
              signer: props.__asDraft ? props.email : null,
              status: props.__asDraft ? 'draft' : 'signed',
              signatureProperties: props.__asDraft ? props.signatureProperties : null,
              histories: props.__asDraft ? null : [history],
            },
            update: doc => ({
              files: sql`array_append(${doc.files}, ${saved.url})`,
              checksums: sql`array_append(${doc.checksums}, ${checksum})`,
              ...(!props.__asDraft && {
                signer: null,
                histories: sql`
                  COALESCE(${doc.histories}, '[]'::jsonb)
                  || ${JSON.stringify([history])}::jsonb
                `,
              }),
            })
          })
        }
      } else {
        // Save minimal record for non-logged-in users (for counting top signers)
        await db.query.documents.upsert({
          data: {
            id: props.id,
            owner: props.email,
            title: props.fileName,
            status: 'signed',
            esign: !props.__manual,
            to: props.to,
            histories: [history],
          },
          update: doc => ({
            signer: null,
            histories: sql`
              COALESCE(${doc.histories}, '[]'::jsonb)
              || ${JSON.stringify([history])}::jsonb
            `,
          })
        })
      }

      await db.query.signers.upsert({
        data: {
          nik: props.nik,
          email: props.email,
          name: props.nama,
          rank: props.pangkat,
          organizations: props.instansi,
          position: props.jabatan,
          phone: props.nomor_telepon,
        }
      })

      await bumpStatistic('signed');
    }

    return response.data;
  } catch (err) {
    //@ts-ignore - err is unknown type, accessing .message requires suppression
    return { error: `[Server Esign Error]${err?.message}.\nHarap mencoba lagi dalam beberapa saat` }
  }
})

export const verifyDocument = command(type({
  file: 'string',
}), async (props) => {
  try {
    const response = await esign.verifyPDF(props)

    if (response.status === 200) {
      await bumpStatistic('verified');
      return response.data;
    }

  } catch (err) {
    //@ts-ignore - err is unknown type, accessing .message requires suppression
    return { error: `[Server Esign Error]${err?.message}.\nHarap mencoba lagi dalam beberapa saat` }
  }

  return {
    conclusion: 'Error',
    description: '[Esign Server Error] Failed to verify document',
  }
})


export const getDocument = query(type({
  id: 'string|string[]',
  checksum: 'string?',
}), async (props) => {
  const ids = Array.isArray(props.id) ? props.id : [props.id];
  return db.query.documents.findMany({
    where: {
      id: {
        in: ids,
      },
    },
  });
})
