import { env } from "$env/dynamic/private";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AI {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY || env.OPENAI_API_KEY || "";
    this.baseUrl = env.AI_BASE_URL || "https://openrouter.ai/api/v1";
    this.model = env.AI_MODEL || "";
  }

  get enabled() {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[]) {
    if (!this.enabled) {
      return { content: "AI chatbot tidak dikonfigurasi. Silakan atur OPENROUTER_API_KEY dan AI_MODEL di environment variables.", role: "assistant" as const };
    }

    if (!this.model) {
      return { content: "Model AI belum dikonfigurasi. Silakan atur AI_MODEL di environment variables.", role: "assistant" as const };
    }

    const systemPrompt: ChatMessage = {
      role: "system",
      content: `Anda adalah asisten AI untuk platform Tapak Astà, platform tanda tangan elektronik (TTE) yang terpercaya, aman, dan sah secara hukum. Tugas Anda adalah membantu pengguna dengan pertanyaan seputar:
- Cara mendaftar dan menggunakan layanan tanda tangan elektronik
- Cara verifikasi dokumen PDF yang sudah ditandatangani
- Informasi umum tentang platform Tapak Astà
- Pemecahan masalah dasar

Jawablah dengan ramah, jelas, dan dalam bahasa Indonesia. Jika Anda tidak tahu jawabannya, akui saja dan jangan membuat informasi palsu.`
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };

    if (this.baseUrl.includes("openrouter")) {
      headers["HTTP-Referer"] = "https://asta.mojokertokota.go.id";
      headers["X-Title"] = "Tapak Astà";
    }

    const req = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [systemPrompt, ...messages],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!req.ok) {
      const text = await req.text();
      throw new Error(`AI API error (${req.status}): ${text}`);
    }

    const data = await req.json();
    return {
      content: data.choices?.[0]?.message?.content || "Maaf, saya tidak dapat merespons saat ini.",
      role: "assistant" as const,
    };
  }
}
