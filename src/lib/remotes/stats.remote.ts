import { query } from "$app/server";
import { db } from "$lib/server/db";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
dayjs.extend(weekOfYear);

export const getStats = query("unchecked", async () => {
  const todayKey = dayjs().format("YYYY-MM-DD");
  const stats = await db.query.documentStatistics.findMany();

  const now = dayjs();
  const yesterday = now.subtract(1, "day");


  return stats.reduce(
    (acc, { date, signed = 0, verified = 0 }) => {
      const d = dayjs(date);
      const s = Number(signed);
      const v = Number(verified);

      // total
      acc.signed.total += s;
      acc.verified.total += v;

      // today
      if (d.isSame(now, "day")) {
        acc.signed.today += s;
        acc.verified.today += v;
      }

      // yesterday
      if (d.isSame(yesterday, "day")) {
        acc.signed.yesterday += s;
        acc.verified.yesterday += v;
      }

      // this week
      if (d.isSame(now, "week")) {
        acc.signed.thisWeek += s;
        acc.verified.thisWeek += v;
      }

      // this month
      if (d.isSame(now, "month")) {
        acc.signed.thisMonth += s;
        acc.verified.thisMonth += v;
      }

      // this year
      if (d.isSame(now, "year")) {
        acc.signed.thisYear += s;
        acc.verified.thisYear += v;
      }

      return acc;
    },
    {
      signed: {
        today: 0,
        yesterday: 0,
        thisWeek: 0,
        thisMonth: 0,
        thisYear: 0,
        total: 0,
      },
      verified: {
        today: 0,
        yesterday: 0,
        thisWeek: 0,
        thisMonth: 0,
        thisYear: 0,
        total: 0,
      },
    }
  );
});
