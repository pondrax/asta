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

  return rows.reduce((acc: Record<string, ReturnType<typeof empty>>, r) => {
    if (!r.type || !r.value) return acc;
    const d = dayjs(r.created).startOf("day");
    const v = Number(r.value) || 0;

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
    const s = doc.status || "unknown";
    userDocCounts[s] = (userDocCounts[s] || 0) + 1;
  }

  const diffDays = Math.max(end.diff(start, "day") + 1, 1);
  const dates: string[] = [];
  const userDailyMap: Record<string, Record<string, number>> = {};
  for (let i = 0; i < Math.min(diffDays, 366); i++) {
    const d = start.add(i, "day");
    const key = d.format("YYYY-MM-DD");
    dates.push(key);
    userDailyMap[key] = {};
  }
  for (const doc of userDocs) {
    if (!doc.created) continue;
    const key = dayjs(doc.created).format("YYYY-MM-DD");
    if (userDailyMap[key]) {
      const s = doc.status || "unknown";
      userDailyMap[key][s] = (userDailyMap[key][s] || 0) + 1;
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
    const s = doc.status || "unknown";
    statusMap[s] = (statusMap[s] || 0) + 1;
  }
  const docStatuses = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

  const monthlyMap: Record<string, number> = {};
  for (const doc of userDocs) {
    if (!doc.created) continue;
    const d = dayjs(doc.created);
    if (d.isAfter(start.subtract(1, "day")) && d.isBefore(end.add(1, "day"))) {
      const month = d.format("YYYY-MM");
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

  const totalCounts: Record<string, number> = {};
  for (const doc of allDocs) {
    const s = doc.status || "unknown";
    totalCounts[s] = (totalCounts[s] || 0) + 1;
  }

  const diffDays = Math.max(end.diff(start, "day") + 1, 1);
  const dates: string[] = [];
  const dailyMap: Record<string, Record<string, number>> = {};
  for (let i = 0; i < Math.min(diffDays, 366); i++) {
    const d = start.add(i, "day");
    const key = d.format("YYYY-MM-DD");
    dates.push(key);
    dailyMap[key] = {};
  }
  for (const row of allStats) {
    if (!row.created || !row.type) continue;
    const key = dayjs(row.created).format("YYYY-MM-DD");
    if (dailyMap[key]) dailyMap[key][row.type] = (dailyMap[key][row.type] || 0) + (row.value ?? 0);
  }

  const newUsersByDate: Record<string, number> = {};
  for (const u of allUsers) {
    if (!u.created) continue;
    const key = dayjs(u.created).format("YYYY-MM-DD");
    if (key >= dates[0]) newUsersByDate[key] = (newUsersByDate[key] || 0) + 1;
  }

  const dailyStats = dates.map((date) => ({
    date,
    label: dayjs(date).format("DD MMM"),
    signed: dailyMap[date].signed || 0,
    verified: dailyMap[date].verified || 0,
    "new-request": dailyMap[date]["new-request"] || 0,
    newUsers: newUsersByDate[date] || 0,
  }));

  const statusMap: Record<string, number> = {};
  for (const doc of allDocs) {
    const s = doc.status || "unknown";
    statusMap[s] = (statusMap[s] || 0) + 1;
  }
  const docStatuses = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

  const monthlyMap: Record<string, number> = {};
  for (const doc of allDocs) {
    if (!doc.created) continue;
    const d = dayjs(doc.created);
    if (d.isAfter(start.subtract(1, "day")) && d.isBefore(end.add(1, "day"))) {
      const month = d.format("YYYY-MM");
      monthlyMap[month] = (monthlyMap[month] || 0) + 1;
    }
  }
  const monthlyDocs = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const filteredStats = allStats.filter((r) => {
    if (!r.created) return false;
    const d = dayjs(r.created);
    return d.isAfter(start.subtract(1, "day")) && d.isBefore(end.add(1, "day"));
  });

  const thisWeekSigned = filteredStats
    .filter((r) => r.created && r.type === "signed" && dayjs(r.created).isSame(today, "isoWeek"))
    .reduce((sum, r) => sum + (r.value ?? 0), 0);

  const lastWeekSigned = filteredStats
    .filter((r) => r.created && r.type === "signed" && dayjs(r.created).isSame(today.subtract(7, "day"), "isoWeek"))
    .reduce((sum, r) => sum + (r.value ?? 0), 0);

  const signerCount: Record<string, number> = {};
  for (const doc of allDocs) {
    if (doc.status === "signed" && doc.signer) {
      signerCount[doc.signer] = (signerCount[doc.signer] || 0) + 1;
    }
  }
  const topSignersRaw = Object.entries(signerCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([e, count]) => ({ email: e, count }));

  const signerNames: Record<string, string> = {};
  for (const s of allSigners) {
    if (s.email && topSignersRaw.some((ts) => ts.email === s.email)) {
      signerNames[s.email] = s.name || s.email;
    }
  }
  const topSigners = topSignersRaw.map((s) => ({
    email: s.email,
    count: s.count,
    name: signerNames[s.email] || s.email,
  }));

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
