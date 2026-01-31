import { redirect } from "@sveltejs/kit";

// TEMP store (use Redis/DB in production)
const tempStore = new Map<string, string>();

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get("id") as string;

    // generate short key
    const token = crypto.randomUUID();

    tempStore.set(token, id);

    // auto cleanup after 10 min
    setTimeout(
      () => {
        tempStore.delete(token);
      },
      1 * 60 * 1000,
    );

    throw redirect(303, `/sign?token=${token}`);
  },
};

export async function load({ url }) {
  const token = url.searchParams.get("token");

  if (!token) return { id: "" };

  const id = tempStore.get(token) ?? "";

  return { id };
}
