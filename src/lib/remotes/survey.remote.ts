import { command, getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";

export const submitSurvey = command("unchecked", async (props: { email: string; rating: number; feedback: string }) => {
  await db.query.surveyResponses.upsert({
    data: {
      email: props.email,
      rating: props.rating,
      feedback: props.feedback,
    },
  });

  return { success: true };
});

export const getSurveyResults = query("unchecked", async () => {
  const event = getRequestEvent();
  const user = event.locals.user;
  if (user?.role?.name !== "admin") return null;

  const all = await db.query.surveyResponses.findMany();

  const total = all.length;
  const avgRating = total > 0 ? all.reduce((s, r) => s + (r.rating || 0), 0) / total : 0;
  const ratingCounts: Record<number, number> = {};
  for (const r of all) {
    const val = r.rating || 0;
    ratingCounts[val] = (ratingCounts[val] || 0) + 1;
  }

  return {
    total,
    avgRating: Math.round(avgRating * 10) / 10,
    ratingCounts,
    responses: all.sort((a, b) => ((b.created || "") > (a.created || "") ? 1 : -1)),
  };
});
