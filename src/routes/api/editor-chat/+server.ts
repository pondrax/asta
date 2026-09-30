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
import { PLAN_CHAT_APPENDIX, describePlan, parsePlan, type PlanStep } from "$lib/editor-ai-plan";

/**
 * Free-form document chat for the editor.
 *
 * Where `/api/editor-ai` offers nine fixed actions, this one takes whatever
 * the user actually typed ("tolong buat ini lebih tegas", "add a closing
 * paragraph") and returns the finished text. That is a much wider door, so the
 * guard is stricter in the ways that matter:
 *
 *   - signed in only, same as the fixed actions,
 *   - the model is instructed to return text and nothing else, and the reply
 *     is tidied before it goes back,
 *   - the client is told *whether* the reply is meant to replace the
 *     selection, so it never has to guess that a chatty preamble was a
 *     document edit,
 *   - nothing is applied automatically. The reply is returned for the user to
 *     review and apply deliberately.
 *
 * The conversation is a bounded window rather than the full history: the point
 * is the document in front of the user, and an unbounded transcript would
 * quietly grow into a second way to spend tokens on the same context.
 */

const MAX_SOURCE_CHARS = 12_000;
/** Older turns are kept; anything past this is dropped before the request. */
const MAX_HISTORY_TURNS = 6;
const MAX_MESSAGE_CHARS = 2_000;

const SYSTEM_PROMPT = `Anda adalah asisten penyunting dokumen yang bekerja di dalam penyunting DOCX.

Aturan Anda:
1. Kembalikan HANYA teks hasil akhir. Jangan menambahkan penjelasan, komentar, alasan, atau pembuka seperti "Baik, berikut hasilnya".
2. Jangan menggunakan markdown. Jangan memakai karakter #, *, atau tanda backtick. Jangan memakai heading atau bullet.
2a. Kalau pengguna meminta tabel, tulis tabelmu sebagai teks dengan karakter "|" di awal dan akhir setiap baris, lalu baris pemisah "---" di bawah judul kolom. Contoh: "| No | Nama |" lalu "|---|---|" lalu "| 1 | Ahmad |". Aplikasi akan mengubahnya menjadi tabel sungguhan saat jawaban diterapkan ke dokumen. Jangan menulis tabel dengan spasi atau tab saja.
3. Balas dalam bahasa yang sama dengan bahasa teks dokumen. Kalau dokumen berbahasa Indonesia, balas dalam Bahasa Indonesia.
4. Jangan mengarang fakta, angka, nama, atau tanggal yang tidak ada di dokumen. Jika informasi tidak ada, jangan tambahkan.
5. Jika permintaan tidak bisa dipenuhi dengan teks yang diberikan, balas dengan satu kalimat singkat yang menjelaskan kendalanya, tanpa mengubah apa pun.
6. Hormati permintaan pengguna. Jika pengguna meminta nada tertentu, gaya tertentu, atau penerjemahan, kerjakan itu.
7. Kembalikan HANYA teks yang diminta. Jangan pernah mengulang atau menyalin ulang isi teks dokumen secara utuh. Jika pengguna meminta penambahan, kembalikan HANYA tambahan itu. Jika pengguna meminta perubahan, kembalikan HANYA bagian yang berubah.
8. Tulis kalimat secara normal. Jangan menyisipkan huruf asing, jangan menggabungkan potongan kata menjadi kata baru, dan jangan mengulang karakter.
9. Gunakan hanya huruf Latin, angka, tanda baca biasa, dan baris baru. Jangan gunakan huruf dari huruf China, Jepang, Korea, Cyrillic, Arab, atau huruf lebar.

Format jawaban:
Balas dengan JSON saja, tanpa teks lain, dengan dua kunci:
- "text": teks hasil akhir. Wajib diisi.
- "mode": salah satu dari "replace" atau "insert". Gunakan "replace" hanya jika pengguna meminta teks yang ada diubah. Gunakan "insert" untuk teks baru.
${PLAN_CHAT_APPENDIX}`;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

type RequestPayload = {
  /** What the user typed. */
  message?: string;
  /** The current selection, or the whole document. */
  source?: string;
  /**
   * Whether `source` is a selection or the entire document. The model is told
   * which, because it makes an enormous practical difference: told only "here
   * is the document" and asked for an addition, many models reply with the
   * whole document, and that reply then gets pasted at the cursor.
   */
  hasSelection?: boolean;
  /** Prior turns of this document conversation, oldest first. */
  history?: ChatTurn[];
  /**
   * A structure-preserving listing, supplied by the client.
   *
   * Sent alongside `source` rather than instead of it. `source` is the text a
   * rewrite works on; this is the map a structural plan needs, because
   * "make the first column 2cm" is unanswerable from a flat run of cell values
   * that never says the table exists. Empty when the client did not supply
   * one, in which case a structural request simply comes back as an
   * explanation instead of a plan.
   */
  map?: string;
};

/**
 * The model returned something that is clearly the JSON envelope but could
 * not be parsed into usable text. Surfaced as a 502 so the user sees a
 * retryable message instead of a document containing `{"text": …}`.
 */
class ReplyFormatError extends Error {}

/**
 * Repairs JSON that is nearly right.
 *
 * A model writing prose inside a `text` field routinely emits a raw newline
 * instead of `\n`, which is invalid JSON and makes `JSON.parse` fail. When
 * that happened the reply fell through to the plain-text fallback and the
 * literal `{"text": "…"}` scaffolding got offered as document text — the
 * failure mode was visible scaffolding inside the user's document rather than
 * a clean error.
 *
 * So: control characters inside string values are escaped, and trailing
 * commas before `}` / `]` are dropped. Both are unambiguous repairs that
 * cannot change the author's intended text.
 */
function repairJson(source: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of source) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      // A literal control character inside a JSON string.
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (ch < " ") out += " ";
      else out += ch;
      continue;
    }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * A reply, and the plan it may have carried.
 *
 * `steps` is non-null only when the model proposed a structural change, and it
 * has already been through `parsePlan` by the time it gets here — the allowlist
 * runs at parse time, so a step the editor cannot honour never survives to be
 * returned. The client shows the plan and applies it only on request.
 */
type ChatReply = { text: string; mode: "replace" | "insert"; steps: PlanStep[] | null };

function tidyReply(raw: string): ChatReply {
  // The model was asked for JSON, but a gateway can still wrap it in a fence
  // or a sentence of preamble, so unwrap before parsing rather than trusting.
  let body = tidyModelOutput(raw);

  const fence = body.match(/\{[\s\S]*\}/);
  if (fence) body = fence[0];

  // Annotated because the object literal would otherwise widen `mode` to
  // `string`, which no longer matches the declared union.
  const attempt = (candidate: string): ChatReply | null => {
    try {
      const parsed = JSON.parse(candidate) as {
        text?: unknown;
        mode?: unknown;
        steps?: unknown;
      };
      const text = sanitizeModelText(tidyModelOutput(readString(parsed.text)));
      if (!text) return null;

      // Parsed, not trusted. The model picked from the operations the appendix
      // listed and anything else is dropped here rather than forwarded. A
      // wholly unparseable plan is treated as no plan at all: the text is still
      // a real answer, and a request to resize columns should not be lost
      // because the model's numbers were not to our taste.
      let steps: PlanStep[] | null = null;
      if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        const plan = parsePlan(JSON.stringify({ steps: parsed.steps }));
        if (plan.ok && plan.plan.steps.length > 0) {
          steps = plan.plan.steps;
        } else if (!plan.ok) {
          console.warn(`[editor-chat] plan rejected: ${plan.reason}`);
        }
      }

      return { text, mode: parsed.mode === "replace" ? "replace" : "insert", steps };
    } catch {
      // Try the next form.
    }
    return null;
  };

  const direct = attempt(body);
  if (direct) return direct;

  const repaired = attempt(repairJson(body));
  if (repaired) return repaired;

  // Genuinely not JSON. The model usually meant the text itself, so fall back
  // to inserting the reply verbatim — but never when the reply is obviously
  // the envelope, because inserting `{"text": …}` scaffolding into a document
  // is worse than reporting a failure the user can retry.
  //
  // The test is "starts with `{` and names one of our keys", not "is a
  // balanced object": a reply truncated mid-way has no closing brace, and
  // requiring one let exactly that case fall through to the document.
  if (/^\s*\{/.test(body) && /"(?:text|mode|steps)"\s*:/.test(body)) {
    throw new ReplyFormatError();
  }
  return { text: sanitizeModelText(tidyModelOutput(raw)), mode: "insert", steps: null };
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, "Anda harus masuk untuk menggunakan penyuntingan AI.");
  }

  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    throw error(400, "Permintaan tidak valid.");
  }

  const message = readString(payload.message).trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) {
    throw error(400, "Tidak ada pertanyaan.");
  }

  const source = readString(payload.source).trim();
  const map = readString(payload.map).trim().slice(0, MAX_SOURCE_CHARS);
  // An empty document is deliberately allowed. Writing the opening of a
  // document is the most natural first request against a blank page, and
  // refusing it made the assistant useless exactly when a document is being
  // started. Only an absent editor is a client-side error, handled there.
  const isEmptyDoc = source.length === 0;

  if (source.length > MAX_SOURCE_CHARS) {
    throw error(413, `Teks terlalu panjang (maks ${MAX_SOURCE_CHARS} karakter).`);
  }

  // Only well-formed turns, and only the recent ones.
  const history = Array.isArray(payload.history)
    ? payload.history
        .filter(
          (t): t is ChatTurn =>
            !!t &&
            (t.role === "user" || t.role === "assistant") &&
            typeof t.content === "string" &&
            t.content.trim().length > 0,
        )
        .slice(-MAX_HISTORY_TURNS)
    : [];

  const hasSelection = payload.hasSelection === true;

  // The source is already capped above, so this is only reached on the
  // non-empty path. Computed here rather than at the top so the empty-document
  // case does not build a string it will never read.
  const excerpt =
    source.length > MAX_SOURCE_CHARS
      ? `${source.slice(0, MAX_SOURCE_CHARS)}${TRUNCATION_NOTE}`
      : source;

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE_CHARS) })),
    {
      role: "user" as const,
      // The listing comes first when there is one, because it is the only part
      // that describes the document's *shape*. Read as a preamble, the model
      // knows a request like "lebar kolom pertama jadi 2 cm" is answerable
      // before it sees the prose; after the prose, the same information is
      // buried under whatever text was there.
      content: [
        map ? `Daftar isi dokumen (untuk permintaan struktural):\n"""\n${map}\n"""` : "",
        isEmptyDoc
          ? // No text to work from, so the model is writing from scratch. Saying
            // so explicitly matters: left to itself the model tends to see an
            // empty document as a request to *report* that there is no content.
            `Dokumennya masih kosong — belum ada satu pun teks di dalamnya.\n\nPermintaan pengguna: ${message}\n\nTulis dari nol teks yang diminta. Balas HANYA teks itu, tanpa pengantar, tanpa komentar, dan jangan menolak dengan alasan dokumennya kosong.`
          : hasSelection
            ? `Bagian dokumen yang sedang dipilih pengguna:\n"""\n${excerpt}\n"""\n\nPermintaan pengguna: ${message}`
            : `Seluruh isi dokumen (tidak ada teks yang dipilih):\n"""\n${excerpt}\n"""\n\nPermintaan pengguna: ${message}\n\nPerhatikan: yang di atas adalah isi dokumen untuk dibaca saja. Kembalikan HANYA teks baru yang diminta, bukan isi dokumen itu sendiri.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  let upstream: Response;
  try {
    upstream = await callGateway(messages);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[editor-chat] gateway request failed:", e);
    throw error(502, `Layanan AI tidak dapat dihubungi: ${detail}`);
  }

  if (upstream.status === 429) {
    const retryAfter = Number.parseInt(upstream.headers.get("Retry-After") || "10", 10);
    return json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(`[editor-chat] gateway returned ${upstream.status}: ${detail.slice(0, 400)}`);
    throw error(502, `Layanan AI gagal merespons (${upstream.status}).`);
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    throw error(502, "Respons AI tidak dapat dibaca.");
  }

  let text: string;
  let modelMode: "replace" | "insert";
  let steps: PlanStep[] | null = null;
  try {
    ({ text, mode: modelMode, steps } = tidyReply(extractText(body)));
  } catch (e) {
    if (e instanceof ReplyFormatError) {
      // Shape only, never the content: the text is derived from the user's
      // document and does not belong in logs.
      const raw = extractText(body);
      console.error(
        `[editor-chat] unparseable reply (len=${raw.length}): ${JSON.stringify(raw.slice(0, 120))}`,
      );
      throw error(502, "Format balasan AI tidak dikenali. Silakan coba lagi.");
    }
    throw e;
  }
  if (!text) {
    throw error(502, "AI tidak mengembalikan teks.");
  }

  // "Replace" against an empty document is a misreading, never an intention:
  // there is nothing to replace, and the editor would silently downgrade it to
  // an insert at the cursor anyway. Normalise it here so the client never shows
  // "ready to replace the selected text" for a blank page.
  const mode = isEmptyDoc ? "insert" : modelMode;

  // A plan travels back to the client but is applied only after the user sees
  // it. Returning the steps and the summary — rather than applying anything
  // here — is what keeps that review step real: the server has no handle on
  // the document even if it wanted one.
  return json({
    text,
    mode,
    ...(steps ? { steps, summary: describePlan({ steps }) } : {}),
  });
};
