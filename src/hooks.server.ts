import { redirect, type Handle } from "@sveltejs/kit";
import { paraglideMiddleware } from "$lib/paraglide/server";
import { verifyJWT } from "$lib/server/plugins/jwt";
import { sequence } from "@sveltejs/kit/hooks";

const handleParaglide: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;

    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html.replace("%paraglide.lang%", locale),
    });
  });

export const handleAuth: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get("auth-token");

  if (token) {
    try {
      const userjwt = await verifyJWT(token);

      event.locals.user = await db.query.users.findFirst({
        where: {
          email: userjwt?.email || "-",
        },
        with: {
          role: true,
        },
      });
    } catch {
      event.cookies.delete("auth-token", { path: "/" });
    }
  }

  return resolve(event);
};
export const handleRedirect: Handle = ({ event, resolve }) => {
  if (event.url.pathname === "/asta") {
    return redirect(302, "/");
  }
  if (event.url.pathname === "/d") {
    return redirect(302, "/verify" + event.url.search);
  }

  return resolve(event);
};
export const handle: Handle = sequence(
  handleParaglide,
  handleAuth,
  handleRedirect,
);

import type { HandleValidationError } from "@sveltejs/kit";
import { db } from "$lib/server/db";

export const handleValidationError: HandleValidationError = ({
  event,
  issues,
}) => {
  return {
    message: "Validation Errors",
    //@ts-expect-error
    issues: issues?.summary || issues,
  };
};
