import { createId } from "$lib/utils";
import { db } from "..";

export default async () => {
  console.log("Upserting documents...");
  // const data = Array.from({ length: 100_000 }, (_, i) => ({
  //   id: createId(),
  //   owner: 'pondra@mojokertokota.go.id',
  //   title: `Surat Undangan Rapat ${i}`,
  //   status: 'signed',
  //   files: [
  //     '/uploads/documents/signed_download.rk7r.pdf'
  //   ]
  // }))
  // for (let i = 0; i < data.length; i += 10000) {
  //   await db.query.documents.upsert({
  //     // @ts-expect-error
  //     data: data.slice(i, i + 10000)
  //   })
  // }
  console.log("Documents upserted successfully!");
};
