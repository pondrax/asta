import { db } from "$lib/server/db";
import { json } from "@sveltejs/kit";

export async function GET() {
  const time = performance.now();
  const { count: status } = await db.query.__logs.findManyAndCount({ limit: 1 });
  return json({ message: 'ok', data: status ? 'online' : 'error', time: performance.now() - time })
}