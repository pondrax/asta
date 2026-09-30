/**
 * The contract between the model and the DOCX editor for STRUCTURAL edits.
 *
 * The existing rewrite actions in `/api/editor-ai` return plain prose that gets
 * pasted over the selection. That covers "improve this sentence" and nothing
 * else: creating a table, filling its cells, dropping in a picture and changing
 * heading levels are all things the engine can already do, and all things a
 * pasted sentence cannot express.
 *
 * So this module defines a *plan*: a small, closed list of operations that the
 * model emits as JSON and the editor replays. Two properties matter more than
 * the feature itself:
 *
 *   1. **It is an allowlist, not a passthrough.** The model chooses among
 *      operations; it never invents one, never supplies an engine command, and
 *      never gets to name a target the engine did not offer it. Everything
 *      outside this union is dropped rather than forwarded, so a confused or
 *      hostile model cannot reach the command dispatcher.
 *   2. **It is resolved in two steps.** A plan never carries raw handles or
 *      offsets. It names things the way the document names them — the text of a
 *      heading, the words of a paragraph, the index of a table — and
 *      `resolvePlanTargets` turns those into engine handles just before the
 *      write. That keeps the model's output meaningful to read in a log and
 *      safe to persist, and it means a plan cannot smuggle a stale handle from
 *      one document into another.
 *
 * The vocabulary is deliberately smaller than the engine's. The engine exposes
 * fifty-odd editor commands plus a full automation protocol; this exposes the
 * handful a person actually asks a writing assistant for.
 */

/** Paragraph alignment, matching `EditorCommands.setAlignment`. */
const ALIGNMENTS = ["left", "center", "right", "justify"] as const;
type PlanAlignment = (typeof ALIGNMENTS)[number];
export type { PlanAlignment };

/**
 * Cell shading, as the engine's `ColorValue` wants it: a six-digit hex string
 * with no leading `#`, or `null` to clear direct fill.
 */
const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

/** Built-in styles we are willing to apply by name. */
const STYLES = [
  "Title",
  "Heading 1",
  "Heading 2",
  "Heading 3",
  "Heading 4",
  "Heading 5",
  "Heading 6",
  "Normal",
  "Quote",
  "Intense Quote",
  "List Paragraph",
  "Caption",
  "Subtitle",
] as const;
type PlanStyle = (typeof STYLES)[number];
export type { PlanStyle };

/** Bullet shapes, matching the engine's own list vocabulary. */
const BULLETS = ["Solid", "Hollow", "Square", "Diamond", "Arrow", "Checkmark"] as const;
export type PlanBullet = (typeof BULLETS)[number];

/** Character marks, which is everything a toggle in the toolbar can do. */
const MARKS = ["bold", "italic", "underline"] as const;
export type PlanMark = (typeof MARKS)[number];

/**
 * One step of a plan.
 *
 * Every variant names its target in human terms — `afterText`, `table` by
 * index — never by handle. See the module doc for why.
 */
export type PlanStep =
  /** Insert a table, optionally already filled. `values` is row-major. */
  | {
      op: "insertTable";
      afterText?: string;
      rowCount: number;
      columnCount: number;
      values?: string[][];
      headerRow?: boolean;
    }
  /** Append rows to an existing table. */
  | { op: "addRows"; table: number; count: number; values?: string[][] }
  /** Append columns to an existing table. */
  | { op: "addColumns"; table: number; count: number }
  /** Write one cell by row/column index. This is the "edit the table" verb. */
  | { op: "setCell"; table: number; row: number; column: number; text: string }
  /** Overwrite a whole table's contents, row-major. */
  | { op: "setTableValues"; table: number; values: string[][] }
  /** Restyle a table: make its first row a repeating header. */
  | { op: "setHeaderRow"; table: number; on: boolean }
  /** Shade every selected cell of a row. */
  | { op: "shadeRow"; table: number; row: number; color: string | null }
  /**
   * Resize a table's columns.
   *
   * The engine's own width is stored per cell but authored per grid column, so
   * the model is given the human unit — centimetres — and never twips. A column
   * named by position rather than index ("the second column") is what a person
   * actually says, so `column` is a 0-based index and the model is told to
   * count from the listing.
   *
   * `widths` is per column and must cover the whole grid: OOXML stores a
   * `w:gridCol` for every column, so there is no "leave the rest alone" — and
   * the total is capped at the page's text width regardless, because a table
   * wider than the text column does not lay out at all.
   */
  | { op: "setColumnWidths"; table: number; widthsCm: number[] }
  /** Delete a table entirely. */
  | { op: "deleteTable"; table: number }

  /** Insert a picture, given as a data URI or an https URL the server resolves. */
  | {
      op: "insertImage";
      afterText?: string;
      /** `data:` URI or `https://` URL. Anything else is refused. */
      src: string;
      widthPoints?: number;
      heightPoints?: number;
      title?: string;
    }
  /** Delete the picture nearest the cursor. */
  | { op: "deleteImage" }

  /** Insert a paragraph of text, optionally styled. */
  | {
      op: "insertParagraph";
      afterText?: string;
      text: string;
      style?: PlanStyle;
    }
  /** Replace exactly the quoted phrase, leaving the rest of its paragraph. */
  | { op: "replaceText"; find: string; text: string }
  /** Delete the paragraph containing a phrase. */
  | { op: "deleteParagraph"; find: string }
  /** Turn a paragraph into a bullet or numbered item. */
  | { op: "setList"; find: string; kind: "bullet" | "ordered"; bullet?: PlanBullet }
  /** Apply a character mark to the phrase itself. */
  | { op: "formatText"; find: string; mark: PlanMark }
  /** Align a paragraph. */
  | { op: "align"; find: string; align: PlanAlignment }
  /** Apply a paragraph style by name. */
  | { op: "setStyle"; find: string; style: PlanStyle };

/** A validated plan: a non-empty list of steps, in the order to apply them. */
export interface EditorAiPlan {
  steps: PlanStep[];
}

/** Caps that keep a runaway model from producing an unbounded plan. */
export const PLAN_LIMITS = {
  /** Most steps one request may contain. */
  maxSteps: 24,
  /** Most rows/columns a single inserted table may have. */
  maxTableSize: 20,
  /** Most cells any one table may carry. */
  maxTableCells: 400,
  /** Longest string the model may author in a single field. */
  maxTextLength: 4_000,
  /** Longest phrase used to locate a paragraph. */
  maxFindLength: 200,
  /** Longest image URL. */
  maxUrlLength: 2_000,
  /**
   * Widest a single column may be authored, in centimetres.
   *
   * A4 is 21cm across with 2.54cm margins, so 16.9cm is the full text width of
   * a portrait A4 — past that a column cannot fit on any page this editor
   * produces, and the engine would refuse the write anyway. Clamping here
   * means the refusal is a number the user asked for rather than an error.
   */
  maxColumnCm: 17,
  /** Narrowest a single column may be authored, in centimetres. */
  minColumnCm: 0.5,
} as const;

/**
 * Reads the model's reply as a plan.
 *
 * Tolerant by design: models wrap JSON in prose and fences no matter how firmly
 * the prompt forbids it, so the first `{` / last `}` pair is tried before giving
 * up. Everything past that is strict — an op with a bad field is a bug in the
 * plan, and dropping it silently would apply a partial edit the user did not
 * ask for. So a malformed step fails the whole plan and the caller says so.
 *
 * Returns the plan, or the reason it could not be used.
 */
export function parsePlan(
  raw: string,
): { ok: true; plan: EditorAiPlan } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "AI returned nothing to apply." };

  // Strip a ```json fence if the model added one anyway.
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, reason: "AI did not return an edit plan." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return { ok: false, reason: "AI returned a malformed edit plan." };
  }

  if (!isRecord(parsed)) return { ok: false, reason: "AI returned a malformed edit plan." };

  // Accept both `{ steps: [...] }` and a bare `[...]`, since models pick either.
  const rawSteps = Array.isArray(parsed) ? parsed : parsed.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return { ok: false, reason: "AI returned an empty edit plan." };
  }
  if (rawSteps.length > PLAN_LIMITS.maxSteps) {
    return { ok: false, reason: `A plan may contain at most ${PLAN_LIMITS.maxSteps} steps.` };
  }

  const steps: PlanStep[] = [];
  for (const candidate of rawSteps) {
    const step = readStep(candidate);
    if (!step.ok) return { ok: false, reason: step.reason };
    steps.push(step.step);
  }

  return { ok: true, plan: { steps } };
}

/** One validated step, or why it was rejected. */
type StepResult = { ok: true; step: PlanStep } | { ok: false; reason: string };

function readStep(candidate: unknown): StepResult {
  if (!isRecord(candidate)) return bad("A plan step was not an object.");
  const op = candidate.op;
  if (typeof op !== "string") return bad("A plan step had no operation.");

  switch (op) {
    case "insertTable": {
      const rowCount = readInt(candidate.rowCount, 1, PLAN_LIMITS.maxTableSize);
      const columnCount = readInt(candidate.columnCount, 1, PLAN_LIMITS.maxTableSize);
      if (rowCount === null || columnCount === null) {
        return bad("A table needs a row and column count between 1 and 20.");
      }
      const values = readMatrix(candidate.values);
      if (values === null) return bad("A table's values were not a rectangular list of text.");
      if (values && values.length * columnCount > PLAN_LIMITS.maxTableCells) {
        return bad("That table has too many cells.");
      }
      return {
        ok: true,
        step: {
          op,
          ...(readAnchor(candidate.afterText) ? { afterText: readAnchor(candidate.afterText)! } : {}),
          rowCount,
          columnCount,
          ...(values ? { values } : {}),
          ...(typeof candidate.headerRow === "boolean" ? { headerRow: candidate.headerRow } : {}),
        },
      };
    }

    case "addRows":
    case "addColumns": {
      const table = readIndex(candidate.table);
      if (table === null) return bad("A table step did not say which table.");
      if (op === "addColumns") {
        const count = readInt(candidate.count, 1, PLAN_LIMITS.maxTableSize);
        if (count === null) return bad("addColumns needs a count between 1 and 20.");
        return { ok: true, step: { op, table, count } };
      }
      const count = readInt(candidate.count, 1, PLAN_LIMITS.maxTableSize);
      if (count === null) return bad("addRows needs a count between 1 and 20.");
      const values = readMatrix(candidate.values);
      if (values === null) return bad("addRows values were not a rectangular list of text.");
      return {
        ok: true,
        step: { op, table, count, ...(values ? { values } : {}) },
      };
    }

    case "setCell": {
      const table = readIndex(candidate.table);
      const row = readIndex(candidate.row);
      const column = readIndex(candidate.column);
      const text = readBoundedText(candidate.text);
      if (table === null || row === null || column === null || text === null) {
        return bad("setCell needs a table, row, column and text.");
      }
      return { ok: true, step: { op, table, row, column, text } };
    }

    case "setTableValues": {
      const table = readIndex(candidate.table);
      if (table === null) return bad("setTableValues did not say which table.");
      const values = readMatrix(candidate.values);
      if (!values) return bad("setTableValues needs a rectangular list of rows.");
      if (values.length * Math.max(1, values[0].length) > PLAN_LIMITS.maxTableCells) {
        return bad("That table has too many cells.");
      }
      return { ok: true, step: { op, table, values } };
    }

    case "setHeaderRow": {
      const table = readIndex(candidate.table);
      if (table === null || typeof candidate.on !== "boolean") {
        return bad("setHeaderRow needs a table and true or false.");
      }
      return { ok: true, step: { op, table, on: candidate.on } };
    }

    case "shadeRow": {
      const table = readIndex(candidate.table);
      const row = readIndex(candidate.row);
      if (table === null || row === null) return bad("shadeRow needs a table and a row.");
      if (candidate.color !== null && !readColor(candidate.color)) {
        return bad("shadeRow needs a six-digit hex colour, or null to clear it.");
      }
      return {
        ok: true,
        step: { op, table, row, color: readColor(candidate.color) ?? null },
      };
    }

    case "setColumnWidths": {
      const table = readIndex(candidate.table);
      if (table === null) return bad("setColumnWidths did not say which table.");
      const raw = candidate.widthsCm;
      if (!Array.isArray(raw) || raw.length === 0) {
        return bad("setColumnWidths needs a list of widths in centimetres.");
      }
      // One width per column, and the count is checked against the real grid in
      // the executor — the plan cannot know how many columns table N has.
      const widths: number[] = [];
      for (const value of raw) {
        const cm = readNumber(value, PLAN_LIMITS.minColumnCm, PLAN_LIMITS.maxColumnCm);
        if (cm === null) {
          return bad(
            `Column widths must be numbers between ${PLAN_LIMITS.minColumnCm} and ${PLAN_LIMITS.maxColumnCm} centimetres.`,
          );
        }
        widths.push(cm);
      }
      return { ok: true, step: { op, table, widthsCm: widths } };
    }

    case "deleteTable": {
      const table = readIndex(candidate.table);
      if (table === null) return bad("deleteTable did not say which table.");
      return { ok: true, step: { op, table } };
    }

    case "insertImage": {
      const src = readImageSrc(candidate.src);
      if (!src) {
        return bad("insertImage needs a data: image or an https:// URL.");
      }
      return {
        ok: true,
        step: {
          op,
          ...(readAnchor(candidate.afterText) ? { afterText: readAnchor(candidate.afterText)! } : {}),
          src,
          ...(readNumber(candidate.widthPoints, 12, 1_200) !== null
            ? { widthPoints: readNumber(candidate.widthPoints, 12, 1_200)! }
            : {}),
          ...(readNumber(candidate.heightPoints, 12, 1_200) !== null
            ? { heightPoints: readNumber(candidate.heightPoints, 12, 1_200)! }
            : {}),
          ...(readBoundedText(candidate.title) ? { title: readBoundedText(candidate.title)! } : {}),
        },
      };
    }

    case "deleteImage":
      return { ok: true, step: { op } };

    case "insertParagraph": {
      const text = readBoundedText(candidate.text);
      if (text === null) return bad("insertParagraph needs some text.");
      const style = readStyle(candidate.style);
      return {
        ok: true,
        step: {
          op,
          ...(readAnchor(candidate.afterText) ? { afterText: readAnchor(candidate.afterText)! } : {}),
          text,
          ...(style ? { style } : {}),
        },
      };
    }

    case "replaceText": {
      const find = readAnchor(candidate.find, PLAN_LIMITS.maxFindLength);
      const text = readBoundedText(candidate.text);
      if (!find || text === null) return bad("replaceText needs the text to find and its replacement.");
      return { ok: true, step: { op, find, text } };
    }

    case "deleteParagraph": {
      const find = readAnchor(candidate.find, PLAN_LIMITS.maxFindLength);
      if (!find) return bad("deleteParagraph needs the text identifying the paragraph.");
      return { ok: true, step: { op, find } };
    }

    case "setList": {
      const find = readAnchor(candidate.find, PLAN_LIMITS.maxFindLength);
      if (!find) return bad("setList needs the text identifying the paragraph.");
      if (candidate.kind !== "bullet" && candidate.kind !== "ordered") {
        return bad("setList kind must be bullet or ordered.");
      }
      const bullet = readEnum(candidate.bullet, BULLETS);
      return {
        ok: true,
        step: { op, find, kind: candidate.kind, ...(bullet ? { bullet } : {}) },
      };
    }

    case "formatText": {
      const find = readAnchor(candidate.find, PLAN_LIMITS.maxFindLength);
      if (!find) return bad("formatText needs the text to format.");
      const mark = readEnum(candidate.mark, MARKS);
      if (!mark) return bad(`formatText mark must be one of: ${MARKS.join(", ")}.`);
      return { ok: true, step: { op, find, mark } };
    }

    case "align": {
      const find = readAnchor(candidate.find, PLAN_LIMITS.maxFindLength);
      if (!find) return bad("align needs the text identifying the paragraph.");
      const align = readEnum(candidate.align, ALIGNMENTS);
      if (!align) return bad("align must be left, center, right or justify.");
      return { ok: true, step: { op, find, align } };
    }

    case "setStyle": {
      const find = readAnchor(candidate.find, PLAN_LIMITS.maxFindLength);
      if (!find) return bad("setStyle needs the text identifying the paragraph.");
      const style = readStyle(candidate.style);
      if (!style) return bad(`setStyle needs one of: ${STYLES.join(", ")}.`);
      return { ok: true, step: { op, find, style } };
    }

    default:
      return bad(`AI asked for an unsupported operation: ${op.slice(0, 40)}.`);
  }
}

function bad(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** An integer within bounds, or null. Rejects `3.5`, `"3"`, `NaN` and `Infinity`. */
function readInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Table indices are 0-based and must exist, so the floor is 0. */
function readIndex(value: unknown): number | null {
  return readInt(value, 0, 999);
}

function readNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** A phrase, trimmed and capped. Returns null when empty or over-long. */
/**
 * A phrase that addresses content, such as `find` or `afterText`.
 *
 * Trimmed, because a model that wraps its JSON in whitespace still meant the
 * phrase. The cap is the shorter of the two limits on offer: a phrase is a
 * quotation, not authored prose, so `maxFindLength` is its real bound and the
 * default is a ceiling rather than a target.
 */
function readAnchor(value: unknown, max: number = PLAN_LIMITS.maxFindLength): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/** Authored text. May be empty (a legitimate blank cell) but never over-long. */
function readBoundedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > PLAN_LIMITS.maxTextLength) return null;
  return value;
}

/**
 * A rectangular `string[][]`, or null.
 *
 * `null` and `undefined` mean "no values supplied", which is different from
 * `[]` (an empty matrix). Ragged rows are rejected rather than padded: a model
 * that emitted `[["a","b"],["c"]]` has misunderstood the table, and guessing a
 * fourth cell would invent content.
 */
function readMatrix(value: unknown): string[][] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return null;
  const rows: string[][] = [];
  let width = -1;
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    const cells: string[] = [];
    for (const cell of row) {
      if (typeof cell !== "string") return null;
      if (cell.length > PLAN_LIMITS.maxTextLength) return null;
      cells.push(cell);
    }
    if (width === -1) width = cells.length;
    else if (cells.length !== width) return null;
    rows.push(cells);
  }
  return rows;
}

/** A six-digit hex colour without `#`, or null when absent. */
function readColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/^#/, "");
  return HEX_COLOR.test(clean) ? clean.toUpperCase() : null;
}

/**
 * An image source the server is willing to fetch.
 *
 * Only `data:image/...` and `https://` are accepted here, which is the first of
 * two guards — the fetch itself re-checks the resolved address. `http:` is
 * refused rather than upgraded, because silently changing a scheme the model
 * chose would hide a mistake.
 */
function readImageSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const src = value.trim();
  if (!src || src.length > PLAN_LIMITS.maxUrlLength) return null;
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(src)) return src;
  if (/^https:\/\/[^\s]+$/i.test(src)) return src;
  return null;
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

function readStyle(value: unknown): PlanStyle | null {
  return readEnum(value, STYLES);
}

/**
 * The instruction handed to the model.
 *
 * It names the operations, gives one worked example, and — most importantly —
 * states the addressing rule, because a plan that says "table 0" when the
 * document has no tables, or that guesses at a paragraph's text, is the single
 * most likely way for this feature to produce nothing.
 */
export const PLAN_SYSTEM_PROMPT = `Anda adalah asisten penyunting dokumen DOCX. Berbeda dari aksi rewrite, Anda boleh MENGUBAH STRUKTUR dokumen, bukan hanya kalimatnya.

You answer with ONE JSON object and nothing else. No prose, no explanation, no markdown fence.

Shape:
{"steps": [ {"op": "...", ...}, ... ]}

Operations:
- {"op":"insertTable","afterText":"some text in the document","rowCount":3,"columnCount":3,"values":[["Header A","Header B","Header C"],["a","b","c"]],"headerRow":true}
  Creates a table AFTER the paragraph containing "afterText". "values" is row-major
  and optional; supply it to fill the table as you create it. Omit "afterText" to
  insert at the cursor.
- {"op":"addRows","table":0,"count":2,"values":[["x","y"],["z","w"]]} — appends rows to table 0.
- {"op":"addColumns","table":0,"count":1} — appends columns to table 0.
- {"op":"setCell","table":0,"row":1,"column":2,"text":"new value"} — writes ONE cell.
- {"op":"setTableValues","table":0,"values":[["a","b"],["c","d"]]} — rewrites the whole table.
- {"op":"setHeaderRow","table":0,"on":true} — makes row 0 a repeating header.
- {"op":"shadeRow","table":0,"row":0,"color":"D9E2F3"} — six hex digits, no "#". Use null to clear.
- {"op":"setColumnWidths","table":0,"widthsCm":[2,6,5]} — resizes EVERY column of table 0.
  Widths are centimetres, one per column, in order. "widthsCm":[2,6,5] makes the
  first column 2cm, the second 6cm, the third 5cm.
  IMPORTANT: you must supply a width for EVERY column, because there is no way to
  change one column and leave the rest alone. Read the column count from the
  document listing, then write out a full list. If the user wants column 2 of 5
  to be 6cm, keep the other four at their current size and put 6 in position 2.
  You cannot read the current widths, so leave the others at a sensible default
  (about 4cm each) unless the user gave a total table width to share out.
- {"op":"deleteTable","table":0}
- {"op":"insertImage","afterText":"some text","src":"https://example.com/photo.png","widthPoints":300,"heightPoints":200}
  "src" must be a data: image or an https:// URL.
- {"op":"deleteImage"}
- {"op":"insertParagraph","afterText":"some text","text":"new paragraph","style":"Heading 1"}
- {"op":"replaceText","find":"exact text in a paragraph","text":"the replacement"}
- {"op":"deleteParagraph","find":"exact text identifying the paragraph"}
- {"op":"setList","find":"exact text","kind":"bullet"} — kind is bullet or ordered.
- {"op":"formatText","find":"exact text","mark":"bold"} — mark is bold, italic or underline.
- {"op":"align","find":"exact text","align":"center"} — left, center, right or justify.
- {"op":"setStyle","find":"exact text","style":"Heading 2"}

Rules:
1. Table indices are 0-based and count tables in document order. The document
   listing you are given names each one, like "table 0 (6x3, header row
   repeats): No | Nama | Keterangan / 1 | | / 2 | | / …3 more row(s)". A
   request about a table that already exists ("shade its header row", "add a
   row") needs that index — without the listing line you have no way to know the
   table exists at all.
2. "find" and "afterText" must be text that ALREADY appears in the document, copied
   EXACTLY. Copy at most the first few words of the paragraph. Never invent a
   phrase you have not been shown.
3. Only use a style from this list: ${STYLES.join(", ")}.
4. Use the fewest steps that achieve the request. Do not restate the document.
5. If the request cannot be done with these operations, return {"steps":[]}.

Example answer:
{"steps":[{"op":"insertTable","afterText":"Data Pengajuan","rowCount":2,"columnCount":2,"values":[["Nama","Nilai"],["Andi","90"]],"headerRow":true}]}`;

/**
 * The structural half of the chat system prompt.
 *
 * `/api/editor-chat` is a text endpoint — it answers "rewrite this paragraph"
 * and the reply is pasted back. But "make the first column narrower" is not
 * text, and a model that has never been told about widths will cheerfully
 * answer it with a sentence about column widths, which then gets pasted into
 * the document as prose. That is the failure this exists to prevent: the chat
 * needs the same vocabulary the structural lane already has.
 *
 * Kept separate from `PLAN_SYSTEM_PROMPT` because the two are never sent
 * together. That prompt opens by demanding a bare JSON object, and this one
 * is a postscript to a prompt that demands two keys; pasting the strict
 * contract into the middle of the chat prompt would make the model answer
 * chat questions with a plan. So the chat prompt keeps its `{text, mode}`
 * contract and *adds a third key* instead, and the client only ever applies a
 * plan after showing it.
 *
 * Deliberately a subset. The operations worth offering a chat message are the
 * ones a person asks for by describing a shape — "add a table", "shade the
 * header". The rest (images, paragraph surgery) belong to the AI menu, which
 * has a dialog for confirming a risky step.
 */
export const PLAN_CHAT_APPENDIX = `

Permintaan struktural (opsional):
Beberapa permintaan tidak bisa dijawab dengan teks, melainkan dengan mengubah bentuk dokumen, misalnya mengubah lebar kolom, menambah baris, atau mewarnai baris judul. Untuk permintaan seperti itu, JANGAN menulis kalimat tentang hal itu. Gunakan kunci ketiga, "steps", berisi daftar operasi.

Bentuk kunci "steps" (JSON, satu operasi per objek):
{"op":"insertTable","afterText":"teks paragraf yang sudah ada di dokumen","rowCount":2,"columnCount":2,"values":[["Nama","Nilai"],["Andi","90"]]}
{"op":"addRows","table":0,"count":1}
{"op":"addColumns","table":0,"count":1}
{"op":"setCell","table":0,"row":1,"column":2,"text":"isi baru"}
{"op":"setHeaderRow","table":0,"on":true}
{"op":"shadeRow","table":0,"row":0,"color":"D9E2F3}
{"op":"setColumnWidths","table":0,"widthsCm":[2,6,5]}

Aturan untuk "steps":
1. Indeks tabel mulai dari 0 dan dihitung sesuai urutan dokumen.
2. "afterText" harus menyalin teks yang BENAR-BENAR ada di dokumen.
3. "widthsCm" memakai sentimeter, satu angka untuk SETIAP kolom tabel, berurutan.
   Example: {"op":"setColumnWidths","table":0,"widthsCm":[2,6,5]} membuat kolom pertama 2cm,
   kolom kedua 6cm, kolom ketiga 5cm. Harus lengkap — tidak bisa mengubah satu kolom
   saja sambil membiarkan yang lain. Jumlah kolom bisa dibaca dari daftar dokumen.
4. "color" adalah enam digit heksadesimal tanpa "#". Contoh: "D9E2F3".
5. Kalau permintaan tidak bisa dilakukan dengan operasi di atas, JANGAN memakai "steps" —
   balas dengan kalimat singkat yang menjelaskan kendalanya lewat "text".
6. Kalau memakai "steps", "text" tetap diisi dengan satu kalimat singkat yang menjelaskan
   perubahan apa yang akan dilakukan, supaya pengguna bisa memverifikasinya sebelum menerapkannya.
7. Gunakan "steps":[] bersama penjelasan singkat bila tidak ada yang perlu diubah.`;

/**
 * A one-line summary of a plan, for the toast and the log.
 *
 * Deliberately describes intent rather than internals: the user needs to know
 * "inserted a table, 3×3" before the dialog closes, not which handle it used.
 */
export function describePlan(plan: EditorAiPlan): string {
  const counts = new Map<string, number>();
  for (const step of plan.steps) {
    counts.set(step.op, (counts.get(step.op) ?? 0) + 1);
  }
  const verbs: Record<string, string> = {
    insertTable: "table",
    addRows: "row",
    addColumns: "column",
    setCell: "cell",
    setTableValues: "table",
    setHeaderRow: "header row",
    shadeRow: "shading",
    setColumnWidths: "column widths",
    deleteTable: "table removed",
    insertImage: "image",
    deleteImage: "image removed",
    insertParagraph: "paragraph",
    replaceText: "replacement",
    deleteParagraph: "paragraph removed",
    setList: "list",
    formatText: "formatting",
    align: "alignment",
    setStyle: "style",
  };
  const parts: string[] = [];
  for (const [op, count] of counts) {
    const noun = verbs[op] ?? op;
    parts.push(count > 1 ? `${count}× ${noun}` : noun);
  }
  return parts.join(", ");
}
