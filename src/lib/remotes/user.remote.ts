import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import { createJWT } from "$lib/server/plugins/jwt";

export const impersonate = command("unchecked", async (email: string) => {
  const user = await db.query.users.findFirst({
    where: { email },
    with: { role: true, organization: true },
  });
  if (!user) throw new Error("User not found");

  const token = await createJWT({ email: user.email, impersonated: true });
  getRequestEvent().cookies.set("impersonate-token", token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 3600,
  });
  return { token, user: { email: user.email, role: user.role?.name } };
});

export const stopImpersonation = command("unchecked", async () => {
  getRequestEvent().cookies.delete("impersonate-token", { path: "/" });
  return { success: true };
});
