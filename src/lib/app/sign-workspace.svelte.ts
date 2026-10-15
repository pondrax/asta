/**
 * Shared state between the signing workspace page (which owns all the document
 * actions) and the global navbar (which renders the editor-style menubar when a
 * workspace route is active).
 *
 * The page populates `menus`/`docName` from its own state; the navbar renders
 * them generically so the two can live on the same row.
 */
export type WorkspaceMenuItem = {
  icon: string;
  label: string;
  action?: () => void;
  href?: string;
  disabled?: boolean;
  shortcut?: string;
  badge?: string;
};

export type WorkspaceMenuEntry = WorkspaceMenuItem | "sep";

export type WorkspaceMenu = {
  id: string;
  label: string;
  items: WorkspaceMenuEntry[];
};

export const workspace = $state<{
  active: boolean;
  docName: string;
  menus: WorkspaceMenu[];
  right: boolean;
  toggleRight: () => void;
  sign: () => void;
  canSign: boolean;
  signing: boolean;
}>({
  active: false,
  docName: "Tanpa Judul",
  menus: [],
  right: false,
  toggleRight: () => {},
  sign: () => {},
  canSign: false,
  signing: false,
});
