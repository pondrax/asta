import { getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";
import { __logs } from "$lib/server/db/schema";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { promises as fs } from "fs";
import path from "path";
import { env } from "$env/dynamic/private";

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

  const now = dayjs().startOf("day");
  const yesterday = now.subtract(1, "day");

  return rows.reduce((acc: Record<string, ReturnType<typeof empty>>, row) => {
    if (!row.type || !row.value) return acc;
    const day = dayjs(row.created).startOf("day");
    const value = Number(row.value) || 0;

    const bucket = acc[row.type] ??= empty();

    bucket.total += value;
    if (day.isSame(now, "day")) bucket.today += value;
    if (day.isSame(yesterday, "day")) bucket.yesterday += value;
    if (day.isSame(now, "isoWeek")) bucket.thisWeek += value;
    if (day.isSame(now, "month")) bucket.thisMonth += value;
    if (day.isSame(now, "year")) bucket.thisYear += value;

    return acc;
  }, {});
});

export const getDashboard = query("unchecked", async () => {
  const event = getRequestEvent();
  const user = event.locals.user;
  if (!user?.email) return null;

  const email = user.email;
  const today = dayjs().startOf("day");
  const start = today.subtract(89, "day");
  const end = today;

  const [userDocs, recentLogs] = await Promise.all([
    db.query.documents.findMany({ where: { owner: email } }),
    db.query.__logs.findMany({ orderBy: { created: "desc" }, limit: 10 }),
  ]);

  const userDocCounts: Record<string, number> = {};
  for (const doc of userDocs) {
    const status = doc.status || "unknown";
    userDocCounts[status] = (userDocCounts[status] || 0) + 1;
  }

  const diffDays = Math.max(end.diff(start, "day") + 1, 1);
  const dates: string[] = [];
  const userDailyMap: Record<string, Record<string, number>> = {};
  for (let i = 0; i < Math.min(diffDays, 366); i++) {
    const day = start.add(i, "day");
    const key = day.format("YYYY-MM-DD");
    dates.push(key);
    userDailyMap[key] = {};
  }
  for (const doc of userDocs) {
    if (!doc.created) continue;
    const key = dayjs(doc.created).format("YYYY-MM-DD");
    if (userDailyMap[key]) {
      const status = doc.status || "unknown";
      userDailyMap[key][status] = (userDailyMap[key][status] || 0) + 1;
    }
  }

  const dailyStats = dates.map((date) => ({
    date,
    label: dayjs(date).format("DD MMM"),
    signed: userDailyMap[date].signed || 0,
    draft: userDailyMap[date].draft || 0,
    queue: userDailyMap[date].queue || 0,
    failed: userDailyMap[date].failed || 0,
  }));

  const statusMap: Record<string, number> = {};
  for (const doc of userDocs) {
    const status = doc.status || "unknown";
    statusMap[status] = (statusMap[status] || 0) + 1;
  }
  const docStatuses = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

  const monthlyMap: Record<string, number> = {};
  for (const doc of userDocs) {
    if (!doc.created) continue;
    const day = dayjs(doc.created);
    if (day.isAfter(start.subtract(1, "day")) && day.isBefore(end.add(1, "day"))) {
      const month = day.format("YYYY-MM");
      monthlyMap[month] = (monthlyMap[month] || 0) + 1;
    }
  }
  const monthlyDocs = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const thisWeekSigned = userDocs
    .filter((doc) => doc.created && doc.status === "signed" && dayjs(doc.created).isSame(today, "isoWeek"))
    .length;

  const lastWeekSigned = userDocs
    .filter((doc) => doc.created && doc.status === "signed" && dayjs(doc.created).isSame(today.subtract(7, "day"), "isoWeek"))
    .length;

  const recentDocs = userDocs
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .slice(0, 5);

  return {
    userDocCounts,
    dailyStats,
    docStatuses,
    monthlyDocs,
    weeklyComparison: { thisWeek: thisWeekSigned, lastWeek: lastWeekSigned },
    recentDocs,
    recentLogs,
  };
});

function computeStatusCounts(docs: Array<{ status?: string | null }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const doc of docs) {
    const status = doc.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function buildDateRange(start: dayjs.Dayjs, end: dayjs.Dayjs): string[] {
  const diffDays = Math.max(end.diff(start, "day") + 1, 1);
  const dates: string[] = [];
  for (let i = 0; i < Math.min(diffDays, 366); i++) {
    const day = start.add(i, "day");
    dates.push(day.format("YYYY-MM-DD"));
  }
  return dates;
}

function buildDailyStatsMap(
  stats: Array<{ created?: string | null; type?: string | number | null; value?: number | null }>,
  dates: string[]
): Record<string, Record<string, number>> {
  const dailyMap: Record<string, Record<string, number>> = {};
  for (const date of dates) {
    dailyMap[date] = {};
  }
  for (const row of stats) {
    if (!row.created || !row.type) continue;
    const key = dayjs(row.created).format("YYYY-MM-DD");
    if (dailyMap[key]) dailyMap[key][row.type] = (dailyMap[key][row.type] || 0) + (row.value ?? 0);
  }
  return dailyMap;
}

function buildNewUsersByDate(
  users: Array<{ created?: string | null }>,
  earliestDate: string
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const user of users) {
    if (!user.created) continue;
    const key = dayjs(user.created).format("YYYY-MM-DD");
    if (key >= earliestDate) map[key] = (map[key] || 0) + 1;
  }
  return map;
}

function computeMonthlyDocs(
  docs: Array<{ created?: string | null }>,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs
): Array<{ month: string; count: number }> {
  const map: Record<string, number> = {};
  for (const doc of docs) {
    if (!doc.created) continue;
    const day = dayjs(doc.created);
    if (day.isAfter(start.subtract(1, "day")) && day.isBefore(end.add(1, "day"))) {
      const month = day.format("YYYY-MM");
      map[month] = (map[month] || 0) + 1;
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

function computeWeekSignedValue(
  stats: Array<{ created?: string | null; type?: string | number | null; value?: number | null }>,
  referenceDay: dayjs.Dayjs
): number {
  return stats
    .filter((row) => row.created && row.type === "signed" && dayjs(row.created).isSame(referenceDay, "isoWeek"))
    .reduce((sum, row) => sum + (row.value ?? 0), 0);
}

function computeTopSigners(
  docs: Array<{ status?: string | null; signer?: string | null }>,
  signers: Array<{ email?: string | null; name?: string | null }>
): Array<{ email: string; count: number; name: string }> {
  const signerCount: Record<string, number> = {};
  for (const doc of docs) {
    if (doc.status === "signed" && doc.signer) {
      signerCount[doc.signer] = (signerCount[doc.signer] || 0) + 1;
    }
  }
  const topSignersRaw = Object.entries(signerCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([email, count]) => ({ email, count }));

  const signerNames: Record<string, string> = {};
  for (const signer of signers) {
    if (signer.email && topSignersRaw.some((ts) => ts.email === signer.email)) {
      signerNames[signer.email] = signer.name || signer.email;
    }
  }
  return topSignersRaw.map((s) => ({
    email: s.email,
    count: s.count,
    name: signerNames[s.email] || s.email,
  }));
}

export const getAdminDashboard = query("unchecked", async () => {
  const today = dayjs().startOf("day");
  const start = today.subtract(89, "day");
  const end = today;

  const [allDocs, allUsers, allSigners, allStats, recentLogs] = await Promise.all([
    db.query.documents.findMany(),
    db.query.users.findMany(),
    db.query.signers.findMany(),
    db.query.documentStatistics.findMany(),
    db.query.__logs.findMany({ orderBy: { created: "desc" }, limit: 10 }),
  ]);

  const totalCounts = computeStatusCounts(allDocs);
  const dates = buildDateRange(start, end);
  const dailyMap = buildDailyStatsMap(allStats, dates);
  const newUsersByDate = buildNewUsersByDate(allUsers, dates[0]);

  const dailyStats = dates.map((date) => ({
    date,
    label: dayjs(date).format("DD MMM"),
    signed: dailyMap[date].signed || 0,
    verified: dailyMap[date].verified || 0,
    "new-request": dailyMap[date]["new-request"] || 0,
    newUsers: newUsersByDate[date] || 0,
  }));

  const docStatuses = Object.entries(computeStatusCounts(allDocs)).map(([status, count]) => ({ status, count }));
  const monthlyDocs = computeMonthlyDocs(allDocs, start, end);

  const filteredStats = allStats.filter((row) => {
    if (!row.created) return false;
    const day = dayjs(row.created);
    return day.isAfter(start.subtract(1, "day")) && day.isBefore(end.add(1, "day"));
  });

  const thisWeekSigned = computeWeekSignedValue(filteredStats, today);
  const lastWeekSigned = computeWeekSignedValue(filteredStats, today.subtract(7, "day"));

  const topSigners = computeTopSigners(allDocs, allSigners);

  return {
    totalCounts,
    dailyStats,
    docStatuses,
    monthlyDocs,
    weeklyComparison: { thisWeek: thisWeekSigned, lastWeek: lastWeekSigned },
    topSigners,
    recentLogs,
    totalUsers: allUsers.length,
    totalSigners: allSigners.length,
    totalDocs: allDocs.length,
  };
});

export const getDiskUsage = query("unchecked", async () => {
  try {
    const targetDir = path.resolve(env.STORAGE_BASE_DIR || "./uploads");
    const stats = await fs.statfs(targetDir);

    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    const usagePercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

    return { total, used, free, usagePercent };
  } catch {
    return null;
  }
});
