import { env } from "$env/dynamic/private";

// const ESIGN_URL = env.ESIGN_URL;
// const ESIGN_API_KEY = env.ESIGN_API_KEY;
// const ESIGN_VERIFY_URL = env.ESIGN_VERIFY_URL;
// const ESIGN_VERIFY_KEY = env.ESIGN_VERIFY_KEY;

export class Esign {
  private async makeRequest(url: string, options: RequestInit, apiKey: string) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: apiKey,
      ...options.headers,
    };

    const req = await fetch(url, { ...options, headers });

    if (req.headers.get("content-type")?.includes("text/html")) {
      const htmlText = await req.text();
      throw new Error("[Esign Server Error] " + htmlText);
    }

    return { status: req.status, data: await req.json() };
  }

  async checkUser({ email, nik }: { email?: string; nik?: string }) {
    return this.makeRequest(
      `${env.ESIGN_URL}/api/v2/user/check/status`,
      {
        method: "POST",
        body: JSON.stringify({ email, nik }),
      },
      env.ESIGN_API_KEY,
    );
  }

  async signPDF({
    email,
    nik,
    passphrase,
    signatureProperties = [],
    fileBase64,
    location = "null",
    note = "null",
  }: {
    email?: string;
    nik?: string;
    passphrase: string;
    signatureProperties?: any[];
    fileBase64: string;
    location?: string;
    note?: string;
  }) {
    const { id, ...signature } = signatureProperties[0];
    const props = [
      signatureProperties[0]
        ? { ...signature, location, reason: note }
        : {
            tampilan: "INVISIBLE",
            page: 1,
            originX: 0,
            originY: 0,
            width: 100,
            height: 75,
            location,
            reason: note,
          },
    ];

    console.log(props);
    return this.makeRequest(
      `${env.ESIGN_URL}/api/v2/sign/pdf`,
      {
        method: "POST",
        body: JSON.stringify({
          email,
          nik,
          passphrase,
          signatureProperties: props,
          file: [fileBase64],
        }),
        redirect: "follow",
      },
      env.ESIGN_API_KEY,
    );
  }

  async verifyPDF({ file }: { file: string }) {
    return this.makeRequest(
      `${env.ESIGN_VERIFY_URL}/api/v2/verify/pdf`,
      {
        method: "POST",
        body: JSON.stringify({ file }),
      },
      env.ESIGN_VERIFY_KEY,
    );
  }
}
