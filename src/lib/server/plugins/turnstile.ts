import { env } from "$env/dynamic/private";

export async function validateTurnstile(token: string, remoteip: string) {
  if (!token) throw new Error("Turnstile token is required");

  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  formData.append("remoteip", remoteip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData,
    },
  );

  const { success, "error-codes": errorCodes } = await response.json();

  if (!success) {
    throw new Error(
      `Turnstile validation failed: ${errorCodes?.join(", ") || "Unknown error"}`,
    );
  }
}
