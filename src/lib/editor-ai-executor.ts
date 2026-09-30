import { createBrowserAutomationHost } from "@docx-editor.dev/core/editor";
import type { DocxEditorInstance, SupportedImageMime } from "@docx-editor.dev/core/editor";
import type {
  AutomationBatchResponse,
  AutomationFontWrite,
  AutomationHandle,
  AutomationOperation,
  AutomationParagraphRef,
  AutomationSpan,
  AutomationValue,
} from "@docx-editor.dev/core/automation";
import type { PlanBullet, PlanMark, PlanStep } from "./editor-ai-plan";

/**
 * Replays a validated plan against a live editor.
 *
 * ## Why not the clipboard lane
 *
 * The rewrite actions paste text, because pasting is the editor path that keeps
 * the undo stack and the review guards coherent. That cannot express structure: a
 * pasted blob cannot become a four-column table, and nothing inside it can be
 * addressed afterwards. So this uses the engine's automation protocol instead —
 * `createBrowserAutomationHost`, which the free Apache-2.0 core already exports.
 * The host's `dispose()` releases only its change subscription and leaves the
 * editor mounted and editable, so the user keeps their caret throughout.
 *
 * `save()` is deliberately never called: a browser host does not own the
 * document and refuses with `unsupported-capability`. The caller already has a
 * save path, and an autosave fired from here would fight the user's own.
 *
 * ## Four protocol properties shape this file
 *
 * 1. **A batch is one transaction — if any operation is refused, nothing is
 *    written.** So each step is its own batch. A plan that fails at step 19
 *    leaves steps 1–18 applied, which is the honest outcome. Batching everything
 *    would be all-or-nothing, which sounds safer and is worse here: it would
 *    abandon an otherwise good edit because one paragraph name did not resolve.
 *
 * 2. **Some operations may not share a batch at all** — `insertTable`,
 *    `insertInlinePicture` and `startNewList` among them. A second,
 *    independent reason steps are applied one at a time.
 *
 * 3. **A handle is a ref the host minted, and a command is validated against
 *    handles that already exist.** You cannot construct one, and you cannot
 *    reference one from the same batch that produced it. So every step resolves
 *    in two passes: a *query* pass turning the model's human wording ("after the
 *    heading Ringkasan", "table 0") into real handles, then the *command* that
 *    uses them.
 *
 * 4. **A refusal is reported, never worked around.** A phrase matching two
 *    paragraphs is ambiguous, and editing the first one silently would change a
 *    paragraph the user never named. So it raises, the step is skipped, and the
 *    reason reaches the user.
 */

/** The host this file drives. Aliased so the signatures stay readable. */
type Host = ReturnType<typeof createBrowserAutomationHost>;

/** One table plus the handle needed to edit it. */
interface TableRef {
  readonly index: number;
  readonly handle: AutomationHandle;
}

/** The handles a step needs, resolved in one pass. */
interface Anchor {
  readonly body: AutomationHandle;
  readonly tables: readonly TableRef[];
  /** The unique match for the step's phrase, or null when it named none. */
  readonly match: AutomationSpan | null;
}

/** What a plan run produced, for the caller to report. */
export interface PlanRunResult {
  /** Steps that committed. */
  applied: number;
  /** Steps the engine refused, with its own reason. */
  failures: Array<{ op: string; reason: string }>;
  /** The revision after the run. */
  revision: number;
}

/** Raised when a step cannot be addressed or applied. Always surfaces to the user. */
class StepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepError";
  }
}

/** Picture bounds in points. Wide enough for a figure, too small to break a page. */
const IMAGE_MIN = 24;
const IMAGE_MAX_WIDTH = 600;
const IMAGE_MAX_HEIGHT = 800;
const DEFAULT_IMAGE_WIDTH = 300;
const DEFAULT_IMAGE_HEIGHT = 200;

/** Centimetres to points, the unit the plan speaks and the engine stores. */
const CM_TO_POINTS = 28.3465;

/**
 * Narrowest column the engine will author, in points.
 *
 * The engine's validator rejects a width under 15pt, so a narrower request is
 * lifted to the floor here rather than being sent and refused. Below roughly
 * 0.5cm a column cannot show a character anyway.
 */
const MIN_COLUMN_POINTS = 15;

/**
 * Runs the plan against the mounted editor.
 *
 * `onProgress` fires as each step starts. A plan that inserts several images is
 * slow enough that a silent dialog would read as a hang.
 */
export async function runPlan(
  editor: DocxEditorInstance,
  steps: readonly PlanStep[],
  onProgress?: (done: number, total: number) => void,
): Promise<PlanRunResult> {
  const host = createBrowserAutomationHost(editor);
  const failures: PlanRunResult["failures"] = [];
  let applied = 0;

  try {
    for (const [i, step] of steps.entries()) {
      onProgress?.(i, steps.length);
      try {
        await applyStep(host, step);
        applied += 1;
      } catch (e) {
        const reason = e instanceof StepError ? e.message : describeEngineError(e);
        // Also logged: a refusal here is usually a mismatch between the plan's
        // vocabulary and this particular document, which is worth noticing.
        console.warn(
          `[editor-ai] step ${i + 1}/${steps.length} (${step.op}) refused: ${reason}`,
        );
        failures.push({ op: step.op, reason });
      }
    }
    onProgress?.(steps.length, steps.length);
    return { applied, failures, revision: host.revision() };
  } finally {
    host.dispose();
  }
}

/**
 * A structure-preserving listing of the document, for the model to plan against.
 *
 * The editor's own `query({ type: "paragraphs" })` walks *into* tables and
 * flattens every cell to its own paragraph, so a document with one 6x3 table
 * reads as eighteen unrelated lines. A plan that says "shade the header row of
 * table 0" then has nothing to attach to: the model never learns a table
 * exists, and answers with a plan that cannot be built.
 *
 * The automation host is the only reader that keeps the shape — `getTables`
 * answers one handle per table in document order, and `getTable` reads its
 * grid — so the map is built from those, and the paragraph listing carries the
 * table's own line so nothing is silently dropped from the context.
 *
 * `maxChars` caps the WHOLE listing. A long document degrades to its opening
 * rather than to a truncated tail with no warning, because a plan built on a
 * half-seen document is more dangerous than a request for less context.
 */
export function readDocumentStructure(
  editor: DocxEditorInstance,
  maxChars: number,
  paragraphChars: number,
): string {
  const host = createBrowserAutomationHost(editor);
  try {
    const document = queryHandle(host, { op: "getDocument" });
    if (!document) return "";
    const body = queryHandle(host, { op: "getBody", document });
    if (!body) return "";

    const lines: string[] = [];
    let used = 0;
    /** Appends a line, or reports that the cap is reached so the walk stops. */
    const push = (line: string): boolean => {
      if (used + line.length + 1 > maxChars) return false;
      lines.push(line);
      used += line.length + 1;
      return true;
    };

    const listed = query(host, { op: "getTables", scope: { body } });
    const handles = listed?.kind === "handles" ? listed.handles : [];

    for (const [index, handle] of handles.entries()) {
      const answer = query(host, { op: "getTable", table: handle });
      if (answer?.kind !== "table") continue;
      const { values, rowCount, columnCount, headerRowCount } = answer.table;
      // The grid is rendered compactly rather than as one line per row: a wide
      // table at full fidelity would eat the whole cap and starve the prose.
      const preview = values
        .slice(0, 3)
        .map((row) => row.join(" | ").slice(0, paragraphChars))
        .join(" / ");
      const more = rowCount > 3 ? ` / …${rowCount - 3} more row(s)` : "";
      const head = headerRowCount > 0 ? ", header row repeats" : "";
      const line = `table ${index} (${rowCount}x${columnCount}${head}): ${preview}${more}`;
      if (!push(line)) return lines.join("\n");
    }

    const paragraphs = editor.query({ type: "paragraphs" });
    for (const [i, p] of paragraphs.entries()) {
      const text = p.text.trim().replace(/\s+/g, " ");
      if (!text) continue;
      const style = p.styleId ? ` [style: ${p.styleId}]` : "";
      const body = text.length > paragraphChars ? `${text.slice(0, paragraphChars)}…` : text;
      const line = `p${i}${style}: ${body}`;
      if (!push(line)) return lines.join("\n");
    }

    return lines.join("\n");
  } finally {
    host.dispose();
  }
}

async function applyStep(host: Host, step: PlanStep): Promise<void> {
  switch (step.op) {
    // ---- tables ----------------------------------------------------------
    case "insertTable": {
      const anchor = resolveAnchor(host, step.afterText);
      const res = command(host, {
        op: "insertTable",
        // With no anchor the table lands at the very end of the body, which is
        // where "add a summary table" almost always means. `insertTable` only
        // spells `Before` and `After`, and "after the body" is its end.
        span: step.afterText
          ? { paragraph: requireMatch(anchor, step.afterText).start.paragraph }
          : { body: anchor.body },
        location: "After",
        rowCount: step.rowCount,
        columnCount: step.columnCount,
        ...(step.values ? { values: step.values } : {}),
      });
      requireChanged(res, "The table could not be inserted there.");

      if (step.headerRow) {
        // A second transaction, because the new table's handle only exists once
        // the insert commits. `headerRowCount` is what makes Word repeat the row
        // across a page break, which is why a newly authored table wants it.
        const created = handleOf(answerOf(res));
        if (!created) {
          throw new StepError("The table was created, but its header row could not be marked.");
        }
        const marked = command(host, {
          op: "updateTable",
          table: created,
          mutation: { kind: "properties", headerRowCount: 1 },
        });
        if (!marked.changed) {
          throw new StepError("The table was created, but its header row could not be marked.");
        }
      }
      break;
    }

    case "addRows": {
      const table = requireTable(host, step.table);
      requireChanged(
        command(host, {
          op: "updateTable",
          table: table.handle,
          mutation: {
            kind: "addRows",
            location: "end",
            count: step.count,
            ...(step.values ? { values: step.values } : {}),
          },
        }),
        "The rows could not be added.",
      );
      break;
    }

    case "addColumns": {
      const table = requireTable(host, step.table);
      requireChanged(
        command(host, {
          op: "updateTable",
          table: table.handle,
          mutation: { kind: "addColumns", location: "end", count: step.count },
        }),
        "The columns could not be added.",
      );
      break;
    }

    case "setTableValues": {
      const table = requireTable(host, step.table);
      requireChanged(
        command(host, {
          op: "updateTable",
          table: table.handle,
          mutation: { kind: "values", values: step.values },
        }),
        "The table contents could not be replaced.",
      );
      break;
    }

    case "setHeaderRow": {
      const table = requireTable(host, step.table);
      // A count, not a flag: 1 makes the first row a repeating header, 0 clears
      // the designation.
      requireChanged(
        command(host, {
          op: "updateTable",
          table: table.handle,
          mutation: { kind: "properties", headerRowCount: step.on ? 1 : 0 },
        }),
        "The header row could not be changed.",
      );
      break;
    }

    case "setColumnWidths": {
      const table = requireTable(host, step.table);
      const grid = readTable(host, table);
      if (step.widthsCm.length !== grid.columnCount) {
        // The whole grid has to be rewritten, so a short list is not a partial
        // edit — it is a mismatch. Saying so beats padding, which would apply
        // widths the model never chose.
        throw new StepError(
          `Table ${step.table} has ${grid.columnCount} column${grid.columnCount === 1 ? "" : "s"}, ` +
            `so it needs ${grid.columnCount} width${grid.columnCount === 1 ? "" : "s"}, not ${step.widthsCm.length}.`,
        );
      }

      // Fitted to the page before anything is written. A table wider than the
      // text column does not lay out at all, and the engine's own limit is 22
      // inches, so it would accept widths that render off the edge. Scaled
      // rather than refused: the user asked for column 1 to be wide and column 5
      // to be narrow, and that intent survives a proportional squeeze where a
      // flat "too wide" error does not.
      const room = textWidthPoints(host);
      let widths = step.widthsCm.map((cm) => cm * CM_TO_POINTS);
      const total = widths.reduce((a, b) => a + b, 0);
      if (room > 0 && total > room) {
        const scale = room / total;
        widths = widths.map((w) => w * scale);
      }

      // One transaction per column. The protocol authors width per CELL
      // (`updateTableCell`) and the engine expands that into a full-grid
      // rewrite, so each call reads the current grid, replaces one column, and
      // leaves the rest — which is why they must be sequential and why the
      // last one is the only place a refusal can surface.
      for (const [column, points] of widths.entries()) {
        requireChanged(
          command(host, {
            op: "updateTableCell",
            cell: requireCell(host, table, 0, column),
            // The engine takes POINTS and stores twips. It also refuses
            // anything under 15pt, so a width that rounds below that is lifted
            // to the floor rather than sent and rejected.
            properties: { columnWidth: Math.max(MIN_COLUMN_POINTS, Math.round(points)) },
          }),
          `The width of column ${column + 1} could not be changed.`,
        );
      }
      break;
    }

    case "deleteTable": {
      const table = requireTable(host, step.table);
      requireChanged(
        command(host, {
          op: "updateTable",
          table: table.handle,
          mutation: { kind: "delete" },
        }),
        "The table could not be removed.",
      );
      break;
    }

    case "setCell": {
      const table = requireTable(host, step.table);
      const cell = requireCell(host, table, step.row, step.column);
      requireChanged(
        command(host, {
          op: "updateTableCell",
          cell: cell,
          properties: { value: step.text },
        }),
        `The cell at row ${step.row + 1}, column ${step.column + 1} could not be written.`,
      );
      break;
    }

    case "shadeRow": {
      const table = requireTable(host, step.table);
      const grid = readTable(host, table);
      if (step.row >= grid.rowCount) {
        throw new StepError(rowCountMessage(grid.rowCount, step.row));
      }
      // Fill is a cell property, so the engine's granularity is one cell. The
      // first cell of the row carries the band; a full-width merge is not
      // something this protocol can author, and guessing at one would be worse
      // than a visible partial band. A null colour clears the direct fill,
      // which the engine spells as an empty string.
      requireChanged(
        command(host, {
          op: "updateTableCell",
          cell: requireCell(host, table, step.row, 0),
          properties: { shadingColor: step.color ?? "" },
        }),
        "The row shading could not be applied.",
      );
      break;
    }

    // ---- pictures --------------------------------------------------------
    case "insertImage": {
      const anchor = resolveAnchor(host, step.afterText);
      // Downloaded before anything is written. A failed fetch must not leave
      // behind the empty paragraph the engine inserts ahead of an anchored
      // picture.
      const { base64 } = await fetchImage(step.src);
      const inserted = command(host, {
        op: "insertInlinePicture",
        span: step.afterText
          ? { paragraph: requireMatch(anchor, step.afterText).start.paragraph }
          : { body: anchor.body },
        base64,
        location: step.afterText ? "After" : "End",
      });
      requireChanged(inserted, "The image could not be inserted there.");

      // Sizing is a separate transaction: the picture's handle only exists once
      // the insert commits.
      const picture = handleOf(answerOf(inserted)) ?? lastInlinePicture(host, anchor.body);
      if (!picture) {
        // The image is in the document; only the sizing was lost. Worth saying,
        // not worth undoing over.
        throw new StepError("The image was inserted, but this document would not let it be resized.");
      }
      const sized = command(host, {
        op: "setInlinePicture",
        picture,
        properties: {
          width: clamp(step.widthPoints, IMAGE_MIN, IMAGE_MAX_WIDTH, DEFAULT_IMAGE_WIDTH),
          height: clamp(step.heightPoints, IMAGE_MIN, IMAGE_MAX_HEIGHT, DEFAULT_IMAGE_HEIGHT),
          ...(step.title ? { altTextDescription: step.title } : {}),
        },
      });
      if (!sized.changed) {
        throw new StepError("The image was inserted, but this document refused its size.");
      }
      break;
    }

    case "deleteImage": {
      const anchor = resolveAnchor(host, undefined);
      const target = lastInlinePicture(host, anchor.body);
      if (!target) throw new StepError("There is no image in this document to remove.");
      requireChanged(
        command(host, { op: "deleteInlinePicture", picture: target }),
        "The image could not be removed.",
      );
      break;
    }

    // ---- text and paragraph structure -----------------------------------
    case "insertParagraph": {
      const anchor = resolveAnchor(host, step.afterText);
      const ref: AutomationParagraphRef = step.afterText
        ? { paragraph: requireMatch(anchor, step.afterText).start.paragraph }
        : { body: anchor.body, at: "first" };
      // The engine documents the answer as the new paragraph's handle, which is
      // what lets the style land on the right paragraph below.
      const inserted = command(host, {
        op: "insertParagraph",
        anchor: ref,
        where: step.afterText ? "after" : "before",
        text: step.text,
      });
      requireChanged(inserted, "The paragraph could not be inserted.");

      if (step.style) {
        const created = handleOf(answerOf(inserted));
        if (!created) {
          throw new StepError("The paragraph was added, but its style could not be set.");
        }
        const styled = command(host, {
          op: "setStyle",
          span: { paragraph: created },
          name: step.style,
        });
        // The engine refuses a style name the document does not define rather
        // than minting one — correct, and common enough on imported documents to
        // name in the message.
        if (!styled.changed) {
          throw new StepError(
            `The paragraph was added, but this document does not define a style called "${step.style}".`,
          );
        }
      }
      break;
    }

    case "replaceText": {
      const anchor = resolveAnchor(host, step.find);
      // Replaces exactly the matched run of characters, not the whole
      // paragraph — quoting a phrase should not delete the sentence around it.
      const match = requireMatch(anchor, step.find);
      requireChanged(
        command(host, { op: "replaceSpan", span: { start: match.start, end: match.end }, text: step.text }),
        "The text could not be replaced.",
      );
      break;
    }

    case "deleteParagraph": {
      const anchor = resolveAnchor(host, step.find);
      // The dedicated op, not an empty `replaceSpan`. An empty replacement that
      // crosses a paragraph mark joins the surrounding paragraphs, which is not
      // the same thing as removing the paragraph the user named.
      requireChanged(
        command(host, {
          op: "deleteParagraph",
          paragraph: requireMatch(anchor, step.find).start.paragraph,
        }),
        "The paragraph could not be removed.",
      );
      break;
    }

    case "setList": {
      const anchor = resolveAnchor(host, step.find);
      const paragraph = requireMatch(anchor, step.find).start.paragraph;
      // Solitary: it mints a new numbering definition at the package level.
      requireChanged(
        command(host, { op: "startNewList", paragraph }),
        "The list could not be started.",
      );
      const list = queryHandle(host, { op: "getParagraphList", paragraph });
      if (!list) {
        // A paragraph in no list is REFUSED rather than answered an empty one,
        // so a null here means the start did not take.
        throw new StepError("The list was started, but this paragraph did not join it.");
      }
      const formatted = command(host, {
        op: "setListLevelFormat",
        list,
        level: 0,
        format: listFormat(step),
      });
      if (!formatted.changed) {
        throw new StepError("The list was started, but its marker style was refused.");
      }
      break;
    }

    case "formatText": {
      const anchor = resolveAnchor(host, step.find);
      const match = requireMatch(anchor, step.find);
      // The matched text, not the paragraph. Formatting a whole paragraph
      // because a phrase inside it was named would restyle the rest of it too.
      requireChanged(
        command(host, {
          op: "setFont",
          span: { start: match.start, end: match.end },
          font: FONT_MARKS[step.mark],
        }),
        `The ${step.mark} could not be applied.`,
      );
      break;
    }

    case "align": {
      const anchor = resolveAnchor(host, step.find);
      requireChanged(
        command(host, {
          op: "setParagraphFormat",
          // Whole paragraph: alignment is a paragraph property, so there is
          // nothing finer-grained to address.
          paragraph: { paragraph: requireMatch(anchor, step.find).start.paragraph },
          format: { alignment: ENGINE_ALIGNMENT[step.align] },
        }),
        "The alignment could not be changed.",
      );
      break;
    }

    case "setStyle": {
      const anchor = resolveAnchor(host, step.find);
      requireChanged(
        command(host, {
          op: "setStyle",
          span: { paragraph: requireMatch(anchor, step.find).start.paragraph },
          name: step.style,
        }),
        `This document does not define a style called "${step.style}".`,
      );
      break;
    }
  }
}

// ============ ADDRESSING ============

/**
 * Resolves the handles a step needs, in one query pass.
 *
 * `getDocument` → `getBody` runs first because every other address is reached
 * through the body. Tables come from `getTables`, which answers **one handle per
 * table in document order** — that ordering is the only thing making the model's
 * "table 0" mean anything, so the index the user was shown and the handle used
 * to edit it come from the same list, in the same pass.
 */
function resolveAnchor(host: Host, phrase: string | undefined): Anchor {
  const document = queryHandle(host, { op: "getDocument" });
  if (!document) throw new StepError("The document is not ready yet.");
  const body = queryHandle(host, { op: "getBody", document });
  if (!body) throw new StepError("The document body is not ready yet.");

  const listed = query(host, { op: "getTables", scope: { body } });
  const handles = listed?.kind === "handles" ? listed.handles : [];
  const tables: TableRef[] = handles.map((handle, index) => ({ index, handle }));

  // Only pays for the search when the step named a phrase.
  const found = phrase ? query(host, { op: "search", scope: { body }, text: phrase }) : null;
  const spans = found?.kind === "spans" ? found.spans : [];

  let match: AutomationSpan | null = null;
  if (phrase) {
    if (spans.length === 0) {
      throw new StepError(`No text in this document matches "${truncate(phrase)}".`);
    }
    if (spans.length > 1) {
      // Refused rather than resolved to the first hit. The plan tells the model
      // to quote enough to be unique; picking one when it failed to would edit a
      // paragraph the user never named.
      throw new StepError(
        `"${truncate(phrase)}" appears in ${spans.length} places. Quote more of the paragraph so it is unique.`,
      );
    }
    match = spans[0] ?? null;
  }
  return { body, tables, match };
}

/** The unique match, or a refusal. */
function requireMatch(anchor: Anchor, phrase: string): AutomationSpan {
  if (!anchor.match) {
    throw new StepError(`No text in this document matches "${truncate(phrase)}".`);
  }
  return anchor.match;
}

/** The table at `index`, or a refusal that says what the document actually has. */
function requireTable(host: Host, index: number): TableRef {
  const { tables } = resolveAnchor(host, undefined);
  const table = tables[index];
  if (table) return table;
  if (!tables.length) throw new StepError("This document has no tables.");
  const n = tables.length;
  throw new StepError(
    `This document has ${n} table${n === 1 ? "" : "s"}, so there is no table ${index}. ` +
      `Use an index from 0 to ${n - 1}.`,
  );
}

/** One cell's handle, after checking the index is inside the real grid. */
function requireCell(host: Host, table: TableRef, row: number, column: number): AutomationHandle {
  const grid = readTable(host, table);
  if (row >= grid.rowCount) throw new StepError(rowCountMessage(grid.rowCount, row));
  if (column >= grid.columnCount) {
    throw new StepError(
      `That table has ${grid.columnCount} column${grid.columnCount === 1 ? "" : "s"}, so there is no column ${column}.`,
    );
  }
  const cell = queryHandle(host, {
    op: "getTableCell",
    table: table.handle,
    rowIndex: row,
    cellIndex: column,
  });
  if (!cell) {
    throw new StepError(`The cell at row ${row + 1}, column ${column + 1} could not be located.`);
  }
  return cell;
}

/** A table's dimensions, read separately from its handle. */
function readTable(host: Host, table: TableRef): { rowCount: number; columnCount: number } {
  const answer = query(host, { op: "getTable", table: table.handle });
  if (answer?.kind !== "table") throw new StepError(`Table ${table.index} could not be read.`);
  return { rowCount: answer.table.rowCount, columnCount: answer.table.columnCount };
}

/**
 * The width available for text on this page, in points.
 *
 * Read from the document rather than assumed, because the user may have set
 * margins: a table fitted to a hard-coded A4 width would overflow a document
 * with wider margins, which is the common case for government forms. The first
 * section is used because a table belongs to exactly one, and this is a sizing
 * ceiling rather than a claim about where the table sits.
 *
 * Returns 0 when the document states no geometry, which disables the ceiling
 * rather than guessing a page size.
 */
function textWidthPoints(host: Host): number {
  const document = queryHandle(host, { op: "getDocument" });
  if (!document) return 0;
  const sections = query(host, { op: "getSections", document });
  if (sections?.kind !== "handles" || !sections.handles.length) return 0;
  const first = sections.handles[0];
  if (!first) return 0;
  const setup = query(host, { op: "getPageSetup", section: first });
  if (setup?.kind !== "pageSetup") return 0;
  const { pageWidth, leftMargin, rightMargin } = setup.setup;
  const room = pageWidth - leftMargin - rightMargin;
  return room > 0 ? room : 0;
}

/** The most recently inserted picture, used when an insert does not answer one. */
function lastInlinePicture(host: Host, body: AutomationHandle): AutomationHandle | null {
  const answer = query(host, { op: "getInlinePictures", span: { body } });
  if (answer?.kind !== "handles" || !answer.handles.length) return null;
  return answer.handles[answer.handles.length - 1] ?? null;
}

// ============ ENGINE PLUMBING ============

/**
 * Runs one command.
 *
 * `expectedRevision` is deliberately omitted. It guards a host shared with
 * another writer; this host is private to one plan run, so passing the current
 * revision back would only compare a value with itself.
 */
function command(host: Host, operation: AutomationOperation): AutomationBatchResponse {
  const res = host.execute({ operations: [operation] });
  if (!res.ok) {
    const failed = res.results.find((r) => r.status === "error");
    const detail = failed && failed.status === "error" ? failed.error.detail : undefined;
    const message = failed && failed.status === "error" ? failed.error.message : undefined;
    throw new StepError(message || detail || "The document refused this change.");
  }
  return res;
}

/**
 * Runs one query and returns its answer, or null when the engine refused.
 *
 * A refusal here is usually informational — `getParagraphList` refuses a
 * paragraph that is in no list, for instance — so it is returned rather than
 * thrown. Callers that need the absence to be an error say so themselves.
 */
function query(host: Host, operation: AutomationOperation): AutomationValue | null {
  const res = host.execute({ operations: [operation] });
  if (!res.ok) return null;
  return answerOf(res);
}

/**
 * Runs one query expected to answer a single handle.
 *
 * The union arm is checked rather than cast, so an op that answers something
 * else cannot leak a non-handle into a handle-typed field and fail somewhere
 * less obvious than the call that made the mistake.
 */
function queryHandle(host: Host, operation: AutomationOperation): AutomationHandle | null {
  const answer = query(host, operation);
  return answer?.kind === "handle" ? answer.handle : null;
}

/** The single value a one-operation batch answered. */
function answerOf(res: AutomationBatchResponse): AutomationValue | null {
  const first = res.results[0];
  return first && first.status === "ok" ? first.value : null;
}

/** Unwraps the `handle` arm. Every other arm means "no handle here". */
function handleOf(answer: AutomationValue | null): AutomationHandle | null {
  return answer?.kind === "handle" ? answer.handle : null;
}

function requireChanged(res: AutomationBatchResponse, message: string): void {
  if (!res.changed) throw new StepError(message);
}

function rowCountMessage(rowCount: number, row: number): string {
  return `That table has ${rowCount} row${rowCount === 1 ? "" : "s"}, so there is no row ${row}.`;
}

/** Turns an unexpected throw into something worth showing a user. */
function describeEngineError(e: unknown): string {
  if (e instanceof StepError) return e.message;
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return typeof code === "string" && code ? `${code}: ${e.message}` : e.message || String(e);
  }
  return String(e);
}

// ============ IMAGES ============

/**
 * Resolves a plan's `src` to base64.
 *
 * A `data:` URI is decoded here with no request at all. An `https:` URL goes to
 * the server, which is the only side with network access and the only side that
 * validates the destination. The browser deliberately does not fetch it itself:
 * that would be subject to CORS, and it would hand the user's IP to whatever
 * host the model happened to name.
 */
async function fetchImage(src: string): Promise<{ base64: string }> {
  if (/^data:/i.test(src)) {
    const match = /^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
    if (!match) throw new StepError("The embedded image is not a supported data: URI.");
    assertMime(match[1] ?? "");
    return { base64: match[2] ?? "" };
  }

  let res: Response;
  try {
    res = await fetch("/api/editor-ai-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src }),
    });
  } catch (e) {
    throw new StepError(`The image could not be downloaded: ${e instanceof Error ? e.message : String(e)}`);
  }
  const payload = (await res.json().catch(() => null)) as
    | { mime?: string; base64?: string; error?: string }
    | null;
  if (!res.ok || typeof payload?.base64 !== "string" || typeof payload.mime !== "string") {
    throw new StepError(payload?.error || "The image could not be downloaded.");
  }
  assertMime(payload.mime);
  return { base64: payload.base64 };
}

/**
 * The engine decodes exactly five raster formats.
 *
 * SVG is refused. The core does have an SVG type, but it is a separate vector
 * path that this protocol does not carry, and falling through to it would mean
 * promising support the insert operation cannot honour.
 */
function assertMime(raw: string): SupportedImageMime {
  const clean = raw.toLowerCase().replace(/^image\//, "");
  const table: Record<string, SupportedImageMime> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
  };
  const mime = table[clean];
  if (!mime) throw new StepError(`Images of type ${clean || "unknown"} are not supported.`);
  return mime;
}

// ============ SMALL HELPERS ============

/** The engine publishes alignment in its own title-case spelling. */
const ENGINE_ALIGNMENT = {
  left: "Left",
  center: "Centered",
  right: "Right",
  justify: "Justified",
} as const satisfies Record<PlanStep extends { op: "align"; align: infer A } ? A : never, string>;

/**
 * The level-format and bullet types, reached through the operation that takes
 * them.
 *
 * `@docx-editor.dev/core/automation` exports `AutomationOperation` but not the
 * two types `setListLevelFormat`'s `format` is built from — an upstream gap, not
 * a versioning accident. Deriving them here means the compiler still checks the
 * spelling against the real declaration, and a change upstream would fail the
 * build rather than pass silently.
 */
type ListLevelFormat = Extract<AutomationOperation, { op: "setListLevelFormat" }>["format"];
type ListBullet = NonNullable<ListLevelFormat["bullet"]>;

/**
 * The engine's bullet names, which differ from the plan's by one plural.
 *
 * The engine carries the symbol as a name rather than a character, so Wingdings
 * codepoints — the way older templates did it — are not needed here.
 */
const ENGINE_BULLET = {
  Solid: "Solid",
  Hollow: "Hollow",
  Square: "Square",
  Diamond: "Diamonds",
  Arrow: "Arrow",
  Checkmark: "Checkmark",
} as const satisfies Record<PlanBullet, ListBullet>;

/**
 * Character marks, in the engine's spelling.
 *
 * `underline` is the odd one out: the engine takes a *style* string rather than
 * a boolean, because OOXML has several underline styles and a boolean could not
 * say which. `single` is what a UI toggle produces.
 */
const FONT_MARKS = {
  bold: { bold: true },
  italic: { italic: true },
  underline: { underline: "single" },
} as const satisfies Record<PlanMark, AutomationFontWrite>;

/**
 * Level 0 format for a bulleted or numbered list.
 *
 * A numbered list needs a format string as well as a numbering style: without
 * one Word has nothing to render the marker from, and `1.` is what a user
 * writing "1. 2. 3." expects.
 */
function listFormat(step: PlanStep & { op: "setList" }): ListLevelFormat {
  if (step.kind === "bullet") {
    return { bullet: ENGINE_BULLET[step.bullet ?? "Solid"] };
  }
  return { numbering: "Arabic", formatString: ["%1."] };
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function truncate(text: string, max = 40): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/* ------------------------------------------------------------------------ *
 * Tables that arrive as text
 * ------------------------------------------------------------------------ */

/**
 * A grid recovered from text, or null when the text is not a table.
 *
 * The chatbot is a different lane from the structural planner. It has no plan
 * vocabulary, so a user asking it for a table gets text back — and a model
 * asked for a table with no way to emit one will reach for markdown, because
 * that is what it has seen. Those pipes are not a rendering failure, they are
 * the only table syntax that model has. Since the text is already written and
 * on screen, the only two useful outcomes are "make it a real table" or "do
 * nothing", so this reads the pipes back into a grid.
 */
export interface TextTable {
  /** Cell text, row-major, all rows the same width. */
  readonly values: string[][];
  /**
   * Whether the first row is a header.
   *
   * A markdown table always has one, and so does a tab-separated grid whose
   * first line reads as labels over a column of data. Tab-separated text has no
   * separator row to go by, so the rule is narrow on purpose: the first cell
   * must not be a bare number, because "1 | Ahmad | 30" leading a list is data
   * and treating it as a header would relabel someone's first record.
   */
  readonly headerRow: boolean;
}

/** A line of `---`, `:-:`, `--` or similar: markdown's header separator. */
function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
}

/**
 * A grid needs at least this many data rows.
 *
 * Two is the smallest that can be a table rather than a stray pipe, and it is
 * cheap to check, so there is no reason to be cleverer than this.
 */
const MIN_TABLE_ROWS = 2;

/**
 * A grid needs at least this many columns.
 *
 * One column means nothing split the line in the first place, so the "table"
 * is just a paragraph. Word tables start at one column, but a paragraph of
 * prose is the far more likely reading and must not be converted.
 */
const MIN_TABLE_COLS = 2;

/**
 * Splits one line into cells, tolerating markdown's optional edge pipes.
 *
 * Pipes win over tabs, because a cell may legitimately contain a tab while a
 * row of pipes cannot be anything but a table. A line with neither is not a row.
 */
function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (trimmed.includes("|")) {
    return trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }
  // Tabs split on the raw line, not the trimmed one. Trailing tabs are empty
  // cells, and trimming first would drop them — which turns "No\tNama\tJab"
  // followed by "1\t\t" into a ragged pair instead of the empty row it is.
  if (!line.includes("\t")) return null;
  const cells = line.split("\t").map((cell) => cell.trim());
  return cells.length > 1 ? cells : null;
}

/** True for a bare cell number, which marks a data row rather than a header. */
function isNumericCell(cell: string): boolean {
  return /^\d+$/.test(cell.trim());
}

/**
 * Recover a table from a block of piped or tab-separated lines, or null.
 *
 * Rows are allowed to be ragged, and are padded to the widest one, because that
 * is what people actually type: a header line with five labels and rows that
 * trail off after the second one because the rest is empty. Rejecting those
 * would leave the exact case this exists to fix still broken.
 *
 * The width guard is the opposite case — a block whose rows have nothing in
 * common is not a table, and a stray pipe in prose ("and/or | either way")
 * must stay prose.
 */
export function readTextTable(block: readonly string[]): TextTable | null {
  const rows: string[][] = [];
  let sawSeparator = false;

  for (const line of block) {
    const cells = splitRow(line);
    if (!cells) return null;
    if (isSeparatorRow(cells)) {
      sawSeparator = true;
      continue;
    }
    rows.push(cells);
  }

  if (rows.length < MIN_TABLE_ROWS) return null;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (width < 1) return null;
  // One column means the block never split, so there is no grid here.
  if (width < MIN_TABLE_COLS) return null;

  return {
    values: rows.map((row) => {
      const cells = row.slice(0, width);
      while (cells.length < width) cells.push("");
      return cells;
    }),
    headerRow: sawSeparator || !isNumericCell(rows[0][0] ?? ""),
  };
}

/** A line is tabular when it has pipes, or more than one tab-separated cell. */
function isTabularLine(line: string): boolean {
  if (line.includes("|")) return true;
  return line.split("\t").length > 1;
}

/**
 * The text's tables plus the prose around them, in order.
 *
 * A reply is rarely either/or — it can be a sentence, then a grid, then
 * another sentence, or two grids separated by a paragraph. So this groups
 * consecutive tabular lines into blocks and hands each to `readTextTable`,
 * leaving every other line as text. A block that turns out not to be a real
 * table falls back to text, so a stray pipe degrades to what it already was.
 */
export function splitTextIntoTables(text: string): (string | TextTable)[] {
  const parts: (string | TextTable)[] = [];
  const lines = text.split(/\r?\n/);
  let block: string[] = [];
  let prose: string[] = [];

  const flushProse = () => {
    const body = prose.join("\n").trim();
    if (body) parts.push(body);
    prose = [];
  };
  const flushBlock = () => {
    if (!block.length) return;
    const table = readTextTable(block);
    if (table) {
      // Prose is flushed when the block opens, not here, so that a block that
      // turns out not to be a table can fall back to text without having
      // already been emitted out of order.
      parts.push(table);
    } else {
      // Not a grid after all. Keep the lines as they were.
      prose.push(...block);
    }
    block = [];
  };

  let inBlock = false;
  for (const line of lines) {
    const tabular = isTabularLine(line);
    // A block is a *run* of tabular lines, so it is closed only when the run
    // ends — never between two lines of the same grid. Flushing per line would
    // hand every row to `readTextTable` on its own, and one row is never a
    // table, so nothing would ever be recognised.
    if (tabular) {
      if (!inBlock && prose.length) flushProse();
      inBlock = true;
      block.push(line);
    } else {
      if (inBlock) flushBlock();
      inBlock = false;
      prose.push(line);
    }
  }
  if (inBlock) flushBlock();
  flushProse();

  return parts;
}

/**
 * Writes `text` into the editor, turning any table it contains into a real one.
 *
 * The chatbot can only answer in text, so a request for a table comes back as
 * pipes or tabs. Pasting that verbatim is the bug this exists to fix: the
 * document ends up holding a paragraph of `a | b | c` that reads as garbage
 * and cannot be edited as a table. So the text is split into prose and grids,
 * and each is written in the order it was asked for — prose by `paste`, grids
 * through the same automation lane the structural planner uses.
 *
 * Text with no table in it is pasted whole, so callers pass the real thing and
 * let this decide. Returns the number of tables created, which is zero for an
 * ordinary reply.
 */
export async function applyTextWithTables(
  editor: DocxEditorInstance,
  text: string,
  paste: (chunk: string) => void,
): Promise<number> {
  const parts = splitTextIntoTables(text);
  if (!parts.some((part) => typeof part !== "string")) {
    // No grid anywhere, the common case. The caller's paste path already
    // handles selection restore and undo, so it is used untouched.
    paste(text.trim());
    return 0;
  }

  const host = createBrowserAutomationHost(editor);
  let tables = 0;
  try {
    // The body handle is the span an unanchored table lands at the end of,
    // which is where "make me a table" almost always means.
    const { body } = resolveAnchor(host, undefined);
    for (const part of parts) {
      if (typeof part === "string") {
        paste(part);
        continue;
      }
      const res = command(host, {
        op: "insertTable",
        span: { body },
        location: "After",
        rowCount: part.values.length,
        columnCount: part.values[0].length,
        values: part.values,
      });
      requireChanged(res, "The table could not be inserted.");

      if (part.headerRow) {
        // A second transaction, because the new table's handle only exists
        // once the insert commits. This is what makes Word repeat the row
        // across a page break, which a newly authored table always wants.
        const created = handleOf(answerOf(res));
        if (created) {
          command(host, {
            op: "updateTable",
            table: created,
            mutation: { kind: "properties", headerRowCount: 1 },
          });
        }
      }
      tables += 1;
    }
    return tables;
  } catch (err) {
    // Reading the shape is a guess, so a failure must not cost the user the
    // reply. Nothing is written before the first table is attempted, so if
    // none got through, falling back to a whole paste is still clean.
    if (tables === 0) {
      paste(text.trim());
      return 0;
    }
    throw err;
  } finally {
    host.dispose();
  }
}
