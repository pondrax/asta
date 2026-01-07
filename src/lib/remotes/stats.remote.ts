import { query } from "$app/server";
import { db } from "$lib/server/db";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

const empty = () => ({
  today: 0,
  yesterday: 0,
  thisWeek: 0,
  thisMonth: 0,
  thisYear: 0,
  total: 0
});

export const getStats = query("unchecked", async () => {
  const rows = await db.query.documentStatistics.findMany();

  const now = dayjs();
  const yesterday = now.subtract(1, "day");

  return rows.reduce((acc: Record<string, ReturnType<typeof empty>>, r) => {
    if (!r.type || !r.value) return acc;
    const d = dayjs(r.created);
    const v = +r.value || 0;

    const bucket = acc[r.type] ??= empty();

    bucket.total += v;
    if (d.isSame(now, "day")) bucket.today += v;
    if (d.isSame(yesterday, "day")) bucket.yesterday += v;
    if (d.isSame(now, "isoWeek")) bucket.thisWeek += v;
    if (d.isSame(now, "month")) bucket.thisMonth += v;
    if (d.isSame(now, "year")) bucket.thisYear += v;

    return acc;
  }, {});
});
