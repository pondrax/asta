/**
 * A narrow, one-way bridge from the editor page to the global chatbot.
 *
 * The chatbot lives in the root layout, so it has no access to the editor's
 * engine instance. This module is the seam: the editor registers a handler here
 * when it mounts and clears it when it is destroyed, and the chatbot calls it.
 *
 * Kept deliberately tiny. The chatbot can read the current selection, be told
 * to apply a piece of text, replay a validated structural plan, or be told
 * there is nothing to work with — and nothing else. A wider surface (raw
 * editor access, arbitrary commands) would let a chat message do anything the
 * toolbar can do, which is not what anyone wants from a chat box.
 */

import type { PlanStep } from "$lib/editor-ai-plan";

export type ApplyMode = "replace" | "insert";

export interface EditorBridge {
  /**
   * The text the AI should work on: the current selection, or the whole
   * document when nothing is selected.
   */
  readContext: () => string;
  /**
   * Whether `readContext` returned a selection or the whole document.
   *
   * This matters: asked to "add a closing paragraph" with no selection, a
   * model will happily echo the whole document back as its answer, and that
   * answer then gets pasted at the cursor. The caller needs to be able to say
   * which of the two it sent so the model can be told outright.
   */
  hasSelection: () => boolean;
  /**
   * Writes `text` back into the document.
   *
   * `mode` is the model's judgement about intent: "replace" substitutes the
   * selection, "insert" writes at the cursor. The bridge restores the selection
   * it captured before focus left the document, because by the time the reply
   * arrives the user is looking at a chat panel, not a selection.
   *
   * A table in `text` is written as a real table rather than pasted as pipes,
   * which means the editor has to open its automation host and wait on it, so
   * the result may be a promise. Callers that care should await it; the
   * chatbot does, so its "applying" spinner covers the whole write.
   */
  applyText: (text: string, mode: ApplyMode) => void | Promise<void>;
  /**
   * A structure-preserving listing of the document: numbered paragraphs, each
   * table on a single line, plus where the cursor is.
   *
   * A second read method rather than a variant of `readContext`, because the
   * two are not interchangeable. `readContext` flattens a table into one cell
   * per line — correct for "rewrite this", useless for "make column 2 wider",
   * where the model has to know the table exists and how many columns it has.
   * A caller asking for structure and getting prose would plan against a
   * document that does not exist.
   */
  readMap: () => string;
  /**
   * Replays a structural plan against the document.
   *
   * Still narrow, and deliberately so: the steps arrive already validated by
   * `parsePlan`, an allowlist the server and this module share. There is no
   * path from here to an arbitrary command, and a step the parser rejected
   * never reaches this function. The plan is a fixed vocabulary, not a script.
   *
   * Returns a summary for the user to see, because a plan of several steps can
   * apply some and refuse others — the engine runs each step as its own
   * transaction, so a partial result is real work the user can already see.
   */
  applyPlan: (steps: readonly PlanStep[]) => Promise<PlanResult>;
}

/** What a plan did, in words, for the chatbot to report back. */
export interface PlanResult {
  applied: number;
  refused: number;
  /** The first refusal, in the model's own terms, if there was one. */
  reason?: string;
  /** A one-line description of the intent, from the server. */
  summary: string;
}

let handler: EditorBridge | null = null;

/** Called by the editor on mount and again whenever its options change. */
export function registerEditorBridge(next: EditorBridge | null) {
  handler = next;
}

/** The chatbot checks this to decide whether editing features are available. */
export function hasEditorBridge() {
  return handler !== null;
}

/** Throws if called with no editor mounted — the caller should have checked. */
export function getEditorBridge(): EditorBridge {
  if (!handler) throw new Error("No editor is mounted on this page.");
  return handler;
}
