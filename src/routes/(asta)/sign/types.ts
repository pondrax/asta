export type PlacementKind = "signature" | "text" | "date" | "checkbox";

type PlacementBase = {
  id: string;
  /** 1-indexed page number. */
  page: number;
  /** PDF points, top-left origin of the box, page-relative. */
  originX: number;
  /** PDF points, top edge of the box, from the page top. */
  originY: number;
  /** PDF points. */
  width: number;
  /** PDF points. */
  height: number;
};

export type SignaturePlacement = PlacementBase & {
  kind: "signature";
  imageBase64: string;
  location: string;
  reason: string;
  tampilan: "VISIBLE" | "INVISIBLE";
};

export type TextPlacement = PlacementBase & {
  kind: "text" | "date";
  text: string;
  /** Font size in PDF points. Defaults to 11. */
  size?: number;
};

export type CheckboxPlacement = PlacementBase & {
  kind: "checkbox";
  checked: boolean;
};

export type PlacementType =
  | SignaturePlacement
  | TextPlacement
  | CheckboxPlacement;

/**
 * Legacy name kept for compatibility with `/sign`, drafts and bookmarks. A
 * "signature" is now just the `signature` variant of a placement.
 */
export type SignatureType = {
  canvasWidth: number;
  canvasHeight: number;
  x: number;
  y: number;
  page: number;
};

export type PagesInfoType = {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
};

/**
 * Old drafts stored signature properties without a `kind` discriminator.
 * Normalise them so the renderer/drawer can trust `kind` everywhere.
 */
export function normalizePlacement(p: any): PlacementType {
  if (!p) return p;
  if (!p.kind) return { ...p, kind: "signature" } as SignaturePlacement;
  return p as PlacementType;
}
