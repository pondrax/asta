import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";

/**
 * The AI rewriting surface for the DOCX editor.
 *
 * This route is deliberately separate from `/api/chat`: the chatbot answers
 * questions about the platform, whereas this one rewrites the user's own
 * document text. That makes the blast radius different — the response is
 * written straight into an open document — so the contract is deliberately
 * narrow:
 *
 *   - the caller must be signed in (see the guard below),
 *   - the input is one of a fixed set of action ids, not free-form prompts,
 *   - the output is plain text, and nothing else is interpreted.
 *
 * Without those limits, an anonymous caller could turn the configured model
 * into an open proxy, and could steer it with arbitrary text. Keep the action
 * list and the prompt table below in sync.
 */

const AI_API = env.AI_URL || "http://localhost:20128/v1/chat/completions";

/** Actions that rewrite the selection. Require a non-empty selection. */
const REWRITE_ACTIONS = [
  "improve",
  "shorten",
  "expand",
  "formal",
  "simplify",
  "fix",
] as const;

/** Actions that produce new text from the surrounding document as context. */
const GENERATE_ACTIONS = ["summarize", "translate", "continue"] as const;

const ACTION_IDS = [...REWRITE_ACTIONS, ...GENERATE_ACTIONS] as const;
type ActionId = (typeof ACTION_IDS)[number];

function isActionId(value: unknown): value is ActionId {
  return typeof value === "string" && (ACTION_IDS as readonly string[]).includes(value);
}

/**
 * One instruction per action. These are the *only* places a caller can steer
 * the model, which is what keeps this endpoint from being a generic proxy.
 */
const ACTION_PROMPTS: Record<ActionId, string> = {
  improve: "Perbaiki kualitas tulisannya: buat lebih jelas, lugas, dan mengalir, tanpa mengubah makna.",
  shorten: "Persingkat teks menjadi sekitar setengah panjang aslinya, tetap mempertahankan semua informasi penting.",
  expand: "Kembangkan teks menjadi sekitar dua kali panjang aslinya, menambah penjelasan dan detail yang relevan.",
  formal: "Ubah gaya bahasa menjadi formal dan resmi, seperti dokumen pemerintahan.",
  simplify: "Sederhanakan bahasanya agar mudah dipahami, gunakan kalimat yang lebih pendek dan sederhana.",
  fix: "Perbaiki kesalahan tata bahasa, ejaan, dan tanda baca saja. Jangan mengubah gaya atau isi.",
  summarize: "Ringkas dokumen berikut menjadi poin-poin ringkas.",
  translate: "Terjemahkan teks berikut ke dalam bahasa Inggris, pertahankan format aslinya.",
  continue: "Lanjutkan penulisan dokumen ini secara alami dan konsisten dengan gaya yang sudah dipakai.",
};

const SYSTEM_PROMPT = `Anda adalah asisten penulisan untuk penyunting dokumen.

Aturan Anda:
1. Kembalikan HANYA teks hasil akhir. Jangan menambahkan penjelasan, komentar, alasan, atau pembuka seperti "Berikut hasilnya".
2. Jangan menggunakan markdown. Jangan memakai karakter #, *, atau tanda backtick.
3. Jangan mengulang permintaan pengguna di awal jawaban.
4. Pertahankan bahasa teks yang diberikan. Jika pengguna meminta terjemahan, gunakan bahasa tujuan yang diminta.
5. Jangan mengarang fakta, angka, atau nama yang tidak ada di teks.
6. Jika teks tidak bisa diproses, balas dengan satu kalimat singkat yang menjelaskan kendalanya.`;

/** Guards against a pathological paste blowing up the request. */
const MAX_SOURCE_CHARS = 12_000;
const MAX_INSTRUCTION_CHARS = 1_000;

type RequestPayload = {
  action: string;
  /** The current selection, or the whole document for the generate actions. */
  source?: string;
  /** Optional user steer, e.g. a target tone or extra direction. */
  instruction?: string;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function extractText(body: unknown): string {
  const choice = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  // Some gateways return content as an array of parts.
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string" ? part : readString((part as { text?: unknown })?.text),
      )
      .join("");
  }
  return "";
}

/**
 * Strips the wrappers models like to add despite instructions: fenced blocks,
 * a leading "Here is…"-style preamble, and stray markdown emphasis.
 */
function tidyModelOutput(raw: string): string {
  let out = raw.trim();

  const fence = out.match(/^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();

  out = out.replace(
    /^(?:here(?:'s| is)|berikut(?: hasil)?nya|hasilnya|sure|okay|ok)\b[^\n:]*:\s*/i,
    "",
  );

  return out.trim();
}

export const POST: RequestHandler = async ({ request, locals }) => {
  // AI editing is a signed-in-only feature: the response is written straight
  // into a document, and the gateway key is a shared secret we would rather
  // not expose to anonymous traffic. `/api/*` is otherwise unauthenticated,
  // so this guard is the only thing protecting this key.
  if (!locals.user) {
    throw error(401, "Anda harus masuk untuk menggunakan penyuntingan AI.");
  }

  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    throw error(400, "Permintaan tidak valid.");
  }

  const action = payload?.action;
  if (!isActionId(action)) {
    throw error(400, "Tindakan AI tidak dikenal.");
  }

  const source = readString(payload.source).trim();
  if (!source) {
    throw error(400, "Tidak ada teks untuk diproses.");
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw error(413, `Teks terlalu panjang (maks ${MAX_SOURCE_CHARS} karakter).`);
  }

  const instruction = readString(payload.instruction).trim().slice(0, MAX_INSTRUCTION_CHARS);

  const context = source.length === MAX_SOURCE_CHARS
    ? `${source.slice(0, MAX_SOURCE_CHARS)}\n\n[teks dipotong]`
    : source;

  const userContent = instruction
    ? `Tindakan: ${ACTION_PROMPTS[action]}\n\nTeks:\n"""\n${context}\n"""\n\nTambahan instruksi: ${instruction}`
    : `Tindakan: ${ACTION_PROMPTS[action]}\n\nTeks:\n"""\n${context}\n"""`;

  let upstream: Response;
  try {
    upstream = await fetch(AI_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_KEY || "no-key"}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL || "oc/big-pickle",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        stream: false,
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[editor-ai] gateway request failed:", e);
    throw error(502, `Layanan AI tidak dapat dihubungi: ${message}`);
  }

  if (upstream.status === 429) {
    const retryAfter = Number.parseInt(upstream.headers.get("Retry-After") || "10", 10);
    console.warn(`[editor-ai] rate limited, client should retry after ${retryAfter}s`);
    return json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(`[editor-ai] gateway returned ${upstream.status}: ${detail.slice(0, 400)}`);
    throw error(502, `Layanan AI gagal merespons (${upstream.status}).`);
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    throw error(502, "Respons AI tidak dapat dibaca.");
  }

  const text = tidyModelOutput(extractText(body));

  if (!text) {
    throw error(502, "AI tidak mengembalikan teks.");
  }

  return json({ text, action });
};
