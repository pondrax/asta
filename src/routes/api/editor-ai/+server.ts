import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  callGateway,
  extractText,
  readString,
  tidyModelOutput,
  TRUNCATION_NOTE,
} from "$lib/server/plugins/ai-gateway";
import { sanitizeModelText } from "$lib/utils/ai-output";
import { PLAN_SYSTEM_PROMPT, describePlan, parsePlan, type PlanStep } from "$lib/editor-ai-plan";

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
const GENERATE_ACTIONS = ["summarize", "continue"] as const;

/**
 * The structural action. It is separated from the text actions above because it
 * answers with a validated *plan* rather than prose, and therefore gets a
 * different system prompt and a different response contract further down.
 *
 * A document map is supplied as the source, not raw text: to insert a table
 * "after the section titled Ringkasan" the model has to know what sections
 * exist, and the raw text alone does not tell it that.
 */
const STRUCTURE_ACTIONS = ["structure"] as const;

const ACTION_IDS = [...REWRITE_ACTIONS, ...GENERATE_ACTIONS, ...STRUCTURE_ACTIONS] as const;
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
  continue: "Lanjutkan penulisan dokumen ini secara alami dan konsisten dengan gaya yang sudah dipakai.",
  // Not a text instruction. This prompt is never used for `structure` — the
  // plan vocabulary in PLAN_SYSTEM_PROMPT supersedes it — but the record has to
  // stay total, so it names the action rather than leaving a hole.
  structure: "Ubah struktur dokumen sesuai permintaan pengguna.",
};

const SYSTEM_PROMPT = `Anda adalah asisten penulisan untuk penyunting dokumen.

Aturan Anda:
1. Kembalikan HANYA teks hasil akhir. Jangan menambahkan penjelasan, komentar, alasan, atau pembuka seperti "Berikut hasilnya".
2. Jangan menggunakan markdown. Jangan memakai karakter #, *, atau tanda backtick.
3. Jangan mengulang permintaan pengguna di awal jawaban.
4. Jika pengguna tidak meminta terjemahan, tulis hasil dalam **Bahasa Indonesia**. Jika pengguna minta terjemahan, gunakan bahasa tujuan yang diminta. Saat memperhalus, meringkas, atau menulis ulang teks, jangan mengganti bahasanya.
5. Jangan mengarang fakta, angka, atau nama yang tidak ada di teks.
6. Tulis kalimat secara normal. Jangan menyisipkan huruf asing, jangan menggabungkan potongan kata menjadi kata baru, dan jangan mengulang karakter.
7. Gunakan hanya huruf Latin, angka, tanda baca biasa, dan baris baru. Jangan gunakan huruf dari huruf China, Jepang, Korea, Cyrillic, Arab, atau huruf lebar.
8. Jika teks tidak bisa diproses, balas dengan satu kalimat singkat yang menjelaskan kendalanya.`;

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

/** The response for a structural action: steps, never prose. */
type StructureResponse = { action: ActionId; steps: PlanStep[]; summary: string };

function isStructureAction(action: ActionId): action is (typeof STRUCTURE_ACTIONS)[number] {
  return (STRUCTURE_ACTIONS as readonly string[]).includes(action);
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
    ? `${source.slice(0, MAX_SOURCE_CHARS)}${TRUNCATION_NOTE}`
    : source;

  const isStructure = isStructureAction(action);
  const userContent = isStructure
    ? `Permintaan pengguna: ${instruction || "Perbaiki struktur dokumen ini."}\n\nIsi dokumen saat ini:\n"""\n${context}\n"""`
    : instruction
      ? `Tindakan: ${ACTION_PROMPTS[action]}\n\nTeks:\n"""\n${context}\n"""\n\nTambahan instruksi: ${instruction}`
      : `Tindakan: ${ACTION_PROMPTS[action]}\n\nTeks:\n"""\n${context}\n"""`;

  let upstream: Response;
  try {
    upstream = await callGateway([
      // The plan vocabulary replaces the prose rules entirely: "return only the
      // final text" would actively fight a JSON answer, so it is not applicable
      // here and is not sent.
      { role: "system", content: isStructure ? PLAN_SYSTEM_PROMPT : SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);
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

  // Sanitized here rather than in the UI because this text replaces or extends
  // the user's document: a stray CJK run or invisible bidi control would be
  // saved, exported to DOCX, and reappear for whoever opens the file next.
  const text = sanitizeModelText(tidyModelOutput(extractText(body)));

  if (isStructure) {
    // Parsed, not trusted. `parsePlan` is an allowlist: the model chose from the
    // operations we listed, and anything else is rejected outright rather than
    // forwarded to the editor. This is the same posture as the action-id check
    // above, one level down — the endpoint still never interprets model output
    // as anything other than the shape it promises.
    const plan = parsePlan(tidyModelOutput(text));
    if (!plan.ok) {
      // Not a 5xx: the model answered, it just answered with something we will
      // not apply. The user needs to be told, not to see a server fault.
      console.warn(`[editor-ai] plan rejected: ${plan.reason}`);
      throw error(422, plan.reason);
    }
    const response: StructureResponse = {
      action,
      steps: plan.plan.steps,
      summary: describePlan(plan.plan),
    };
    return json(response);
  }

  if (!text) {
    throw error(502, "AI tidak mengembalikan teks.");
  }

  return json({ text, action });
};
