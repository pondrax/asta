import { command } from "$app/server";
import { db } from "$lib/server/db";
import { createJWT } from "$lib/server/plugins/jwt";

export const impersonate = command("unchecked", async (email: string) => {
  const user = await db.query.users.findFirst({
    where: { email },
    with: { role: true, organization: true },
  });
  if (!user) throw new Error("User not found");

  const token = await createJWT({ email: user.email, impersonated: true });
  return { token, user: { email: user.email, role: user.role?.name } };
});
