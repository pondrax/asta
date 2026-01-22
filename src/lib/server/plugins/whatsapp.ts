import { WHATSAPP_AUTH, WHATSAPP_HOST } from "$env/static/private";

export async function sendMessage({
  recipient,
  payload,
}: {
  recipient: string;
  payload: any;
}) {
  try {
    const response = await fetch(WHATSAPP_HOST + "/api/v1/send", {
      method: "POST",
      headers: {
        Authorization: WHATSAPP_AUTH,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient,
        payload,
      }),
    });
    return response;
  } catch (err) {
    console.log(err);
    return false;
  }
}
