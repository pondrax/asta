/**
 * Guards against the garbage the model gateway intermittently emits.
 *
 * Observed failure, verbatim, from a plain "buat ringkasan tentang aplikasi ini":
 *
 *   "…platform tanda tangan elektronik moorjoelue. Berikut…"
 *   "Halo! 👋-platform singkasan, ya:"
 *   "…layanan iniictive_names tersedia 24 jam…"
 *
 * Two distinct problems, and only the first is cosmetic:
 *
 * 1. **Script bleed.** Runs of CJK, Cyrillic, Arabic, Hangul, or fullwidth
 *    characters turn up mid-sentence. The app is Indonesian-only and the model
 *    is asked to answer in Indonesian, so none of these can be legitimate —
 *    they are dropped, along with the replacement characters and the zero-width
 *    and bidi-control codepoints that hide mojibake from the eye.
 *
 * 2. **Word-level splicing.** Correct text with fragments from elsewhere in the
 *    model's own vocabulary injected mid-sentence ("singa**s**an" from
 *    "ringkasan", "Elektronik **moorjoelue**"). This one cannot be repaired by
 *    any filter, because the result is still well-formed Indonesian words in
 *    the right order — there is no way to tell a spliced word from an intended
 *    one. The only defence is upstream: a temperature of 0 and a shorter
 *    system prompt, both applied in the caller.
 *
 * So `sanitizeModelText` handles the part that is fixable, and the callers
 * handle the part that is not. Splitting it this way keeps the temptation to
 * write an over-eager filter — one that "corrects" real words — out of reach.
 */

/**
 * Scripts that cannot legitimately appear in this app's replies.
 *
 * Latin and Indonesian are excluded deliberately. Emoji are outside every
 * range here, which is intended: the chatbot is asked to use them, and they
 * render fine.
 */
const FOREIGN_SCRIPT = new RegExp(
  "[" +
    "\\u0400-\\u04FF" + // Cyrillic
    "\\u0530-\\u058F" + // Armenian
    "\\u0600-\\u06FF" + // Arabic
    "\\u0750-\\u077F" + // Arabic supplement
    "\\u0900-\\u097F" + // Devanagari
    "\\u0E00-\\u0E7F" + // Thai
    "\\u3040-\\u30FF" + // Kana
    "\\u3400-\\u4DBF" + // CJK ext A
    "\\u4E00-\\u9FFF" + // CJK unified
    "\\uAC00-\\uD7AF" + // Hangul syllables
    "\\uF900-\\uFAFF" + // CJK compatibility
    "\\uFF00-\\uFFEF" + // Fullwidth forms
    "]+",
  "g",
);

/**
 * Codepoints that carry no visible glyph but survive copy-paste and re-encoding:
 * replacement characters, zero-width joiner/space/non-joiner, the invisible
 * operators used to spoof text direction, the bidi control block, and the BOM.
 */
const INVISIBLE = new RegExp(
  "[" +
    "\\u00AD" + // soft hyphen
    "\\u200B-\\u200F" + // zero-width + LRM/RLM
    "\\u202A-\\u202E" + // bidi embedding/override
    "\\u2060-\\u2064" + // word joiner + invisible operators
    "\\u2066-\\u206F" + // bidi isolates + deprecated format chars
    "\\uFEFF" + // BOM / zero-width no-break space
    "\\uFFFD" + // replacement character
    "]",
  "g",
);

/**
 * Separator runs the model uses as filler: `====`, `----`, `****`, `####`.
 *
 * Deliberately excludes `|`, which is a structural character in markdown
 * tables: matching three or more of them turned a `|---|---|` row separator into
 * blank lines and destroyed the table. A run of `=` or `-` on its own line is
 * a horizontal rule, a table separator is not.
 */
const RULE_FILLER = /^[ \t]*(?:[=\-_*~#\u2022\u00B7]){3,}[ \t]*$/gm;

/**
 * Strips only the characters that can never be legitimate, leaving all
 * whitespace, punctuation, and structure untouched.
 *
 * This is the half that is safe to run on an individual streaming delta. It is
 * safe because `TextDecoder.decode(value, { stream: true })` never splits a
 * character across two chunks — it buffers the partial UTF-8 sequence and
 * re-emits it whole — so there is no mid-character boundary to tear. The
 * structural half of `sanitizeModelText` has no such guarantee and must run
 * once on the assembled text.
 */
export function stripForeignChars(chunk: string): string {
  return chunk.replace(FOREIGN_SCRIPT, "").replace(INVISIBLE, "");
}

/**
 * Cleans a model reply for display.
 *
 * Run this on the *assembled* text, never per-delta. It removes filler runs
 * and collapses whitespace, both of which are line-anchored: applied to one
 * delta they would see a partial line and either miss a run that continues in
 * the next chunk or delete text a run was only adjacent to. During streaming,
 * use `stripForeignChars` per delta and apply this once at the end.
 */
export function sanitizeModelText(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    // Collapses to a single space rather than vanishing, so a script run
    // between two words leaves "singa san" instead of gluing them into
    // "singasan". A missing space is a much easier defect for a reader to spot
    // — and therefore to report — than a silently invented word.
    .replace(FOREIGN_SCRIPT, " ")
    .replace(RULE_FILLER, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Coerces model output to Indonesian.
 *
 * The system prompt already asks for Indonesian, so this is a safety net for
 * the case where the model drifts anyway rather than a translation layer. It
 * only detects that the reply is *not* Indonesian and reports it; rewriting
 * the text here would mean sending a second request, which belongs at the call
 * site where a request can actually be made.
 */
export function looksNonIndonesian(text: string): boolean {
  const words = text.match(/[A-Za-z]{2,}/g);
  if (!words || words.length < 8) return false;

  // Indonesian function words. Common enough that a reply made of English will
  // not clear the bar.
  const markers =
    /\b(?:dan|yang|dengan|untuk|adalah|ini|itu|tidak|akan|pada|dari|ke|di|sebagai|oleh|atau|juga|sudah|telah|bisa|dapat|harus|lebih|dalam|agar|ketika|kalau|karena|sehingga|anda|kami|aplikasi|inilah|berikut)\b/i;

  const hits = words.filter((w) => markers.test(w)).length;
  return hits / words.length < 0.08;
}
