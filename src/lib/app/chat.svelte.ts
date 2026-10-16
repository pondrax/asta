/**
 * Shared visibility for the global chatbot panel.
 *
 * The panel is mounted once, in the root layout, but the pages that want to
 * offer an "AI" menu entry live further down the tree and have no handle on
 * it. This is the seam: a page calls `chat.openChat()`, optionally handing
 * over a question to ask on the user's behalf, and the panel reacts.
 *
 * Deliberately tiny — visibility, one pending question, and one piece of
 * context. The conversation itself stays inside the panel.
 */
export const chat = $state<{
  open: boolean;
  /** A question to send as soon as the panel is next on screen. */
  pending: string | null;
  /**
   * Background the model should read but the user should not have to look at:
   * the text of the document an AI menu entry was invoked on. Sent as a system
   * message with the next question only, then cleared, so a document handed
   * over once cannot leak into unrelated later turns.
   */
  context: string | null;
  openChat: (prompt?: string, context?: string) => void;
  toggle: () => void;
}>({
  open: false,
  pending: null,
  context: null,
  openChat(prompt, context) {
    this.pending = prompt ?? null;
    this.context = context ?? null;
    this.open = true;
  },
  toggle() {
    this.open = !this.open;
  },
});
