import { command, form } from "$app/server";
import { env } from "$env/dynamic/private";
import { type } from "arktype";

export const checkUser = command(type('string.email'), async (email) => {
  const response = await fetch(`${env.ESIGN_URL}/api/v2/user/check/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": env.ESIGN_API_KEY,
    },
    body: JSON.stringify({ email }),
  });
  return await response.json();
})