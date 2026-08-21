/**
 * Centralized page titles for the (asta) layout.
 * The layout derives <title> from the current pathname, so individual
 * pages no longer need their own <svelte:head> block.
 */

/** Static route → page name. */
export const ROUTE_TITLES: Record<string, string> = {
  "/sign": "Tanda Tangan Dokumen",
  "/verify": "Verifikasi Dokumen",
  "/me": "Dashboard",
  "/me/documents": "Dokumen Saya",
  "/me/templates": "Template Saya",
  "/templates": "Template Dokumen",
  "/profile": "Profil Pengguna",
  "/survey": "Survey Kepuasan",
  "/user-guide": "Panduan Pengguna",
  "/services/register": "Registrasi Akun BSRE",
  "/main": "Panel Manajemen",
  "/main/documents": "Dokumen Administratif",
  "/main/users": "Kelola Pengguna",
  "/main/logs": "Log Aktivitas",
  "/main/survey": "Data Survey",
  "/main/portal-bsre": "Portal BSrE",
};

/** Content pages served by /pages/[path]. */
export const CONTENT_PAGES: Record<
  string,
  { title: string; content: string }
> = {
  "privacy-policy": {
    title: "Kebijakan Privasi",
    content: "privacy-policy",
  },
  "terms-of-use": {
    title: "Ketentuan Penggunaan",
    content: "terms-of-use",
  },
  "about-us": {
    title: "Tentang Kami",
    content: "about-us",
  },
  contact: {
    title: "Kontak",
    content: "contact",
  },
  guide: {
    title: "Panduan Penggunaan",
    content: "guide",
  },
  helpdesk: {
    title: "Aduan",
    content: "helpdesk",
  },
  "request-user": {
    title: "Pengajuan Pengguna",
    content: "request-user",
  },
  "update-data": {
    title: "Pembaruan Data",
    content: "update-data",
  },
};

/** Build a consistent "<Halaman> – Tapak Astà" title for a pathname. */
export function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/pages/")) {
    const slug = pathname.split("/")[2] ?? "";
    return `${CONTENT_PAGES[slug]?.title ?? "Halaman"} – Tapak Astà`;
  }
  const name = ROUTE_TITLES[pathname];
  return name ? `${name} – Tapak Astà` : "Tapak Astà";
}
