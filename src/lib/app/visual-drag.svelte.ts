/**
 * The signature visual currently being dragged from the metadata panel onto the
 * PDF preview. The drop target reads this to render a live ghost — the actual
 * image, at the size it will occupy in the document — at the cursor. The drag
 * source clears it when the drag ends.
 */
export type VisualDrag = {
  visual: "qr" | "box";
  width: number;
  height: number;
  /** Full data URL of the visual, for the live preview. */
  src: string;
};

let current = $state<VisualDrag | null>(null);

export const getVisualDrag = () => current;
export const setVisualDrag = (value: VisualDrag | null) => (current = value);
