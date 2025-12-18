import { query } from "$app/server";
import { db } from "$lib/server/db";

export const getData = query('unchecked', async () => {
  const data = await db.query.documents.findMany()

  return data
})