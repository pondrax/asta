<script lang="ts">
  import { fly } from "svelte/transition";
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";
  import { app } from "$lib/app/index.svelte";
  import Lottie from "$lib/components/lottie.svelte";
  import Chatbot from "$lib/components/chatbot.svelte";
  import { getPageTitle } from "$lib/app/titles";
  import { getStatus, getAdminCounts } from "$lib/remotes/stats.remote";
  let { children, data } = $props();

  const user = $derived(data.user);
  const pageTitle = $derived(getPageTitle(page.url.pathname));

  let activeMenu = $state<string | null>(null);
  let hideTimer: ReturnType<typeof setTimeout>;

  function showMenu(name: string) {
    clearTimeout(hideTimer);
    activeMenu = name;
  }

  function scheduleHide() {
    hideTimer = setTimeout(() => {
      activeMenu = null;
    }, 200);
  }

  const isMeActive = $derived(
    page.url.pathname === "/me" ||
      page.url.pathname.startsWith("/me/") ||
      page.url.pathname === "/profile" ||
      page.url.pathname === "/templates",
  );

  const isManageActive = $derived(page.url.pathname.startsWith("/main"));

  // Per-scope document counts for nav badges
  const status = $derived(user ? getStatus({}) : undefined);
  const statusCounts = $derived(
    status?.current ?? {
      mine: 0,
      requests: 0,
      signed: 0,
      administrative: 0,
    },
  );

  // Admin nav counts (users, BSrE users, survey responses)
  const admin = $derived(
    user?.role?.name === "admin" ? getAdminCounts({}) : undefined,
  );
  const adminCounts = $derived(
    admin?.current ?? { users: 0, bsreUsers: 0, surveys: 0, logs: 0 },
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <link rel="preconnect" href="https://challenges.cloudflare.com" />
  <script
    src="https://challenges.cloudflare.com/turnstile/v0/api.js"
    async
    defer
  ></script>
</svelte:head>

<div class="h-screen flex flex-col overflow-hidden">
  <div class="relative z-10">
    <div class="navbar bg-base-100 lg:px-5 py-0 shrink-0 h-16">
      <div class="navbar-start">
        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
            <iconify-icon icon="bx:menu-alt-left" class="text-2xl"
            ></iconify-icon>
          </div>
          <ul
            tabindex="-1"
            class="menu dropdown-content bg-base-100 rounded-box z-1 mt-3 w-60 p-2 shadow text-sm"
          >
            <li>
              <details open>
                <summary>Beranda</summary>
                <ul>
                  <li><a href="/">Beranda Utama</a></li>
                  <li><a href="/user-guide">Panduan Pengguna</a></li>
                  <li><a href="/user-guide#faq">Pertanyaan Umum (FAQ)</a></li>
                  <li><a href="/user-guide#legal">Legalitas Hukum TTE</a></li>
                </ul>
              </details>
            </li>
            <li>
              <details>
                <summary>Tanda Tangan</summary>
                <ul>
                  <li><a href="/sign">Upload & Tanda Tangan</a></li>
                  <li><a href="/templates">Template Dokumen</a></li>
                  <li>
                    <a href="/services/register">Registrasi Layanan TTE</a>
                  </li>
                </ul>
              </details>
            </li>
            <li>
              <details>
                <summary>Verifikasi</summary>
                <ul>
                  <li><a href="/verify">Unggah File PDF</a></li>
                  <li><a href="/verify#!/id">Cari Berdasarkan ID</a></li>
                  <li><a href="/verify#!/scan">Pindai QR Code TTE</a></li>
                  <li>
                    <a
                      href="https://cekdokumen.id/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Verifikasi - Cek Dokumen
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://tte.komdigi.go.id/verifyPDF"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Verifikasi - Komdigi
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://bsre.bssn.go.id/pdf-verification"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Verifikasi - BSrE BSSN
                    </a>
                  </li>
                </ul>
              </details>
            </li>
            {#if user}
              <li>
                <details open>
                  <summary>Dashboard</summary>
                  <ul>
                    <li><a href="/me">Overview</a></li>
                    <li>
                      <a
                        href="/me/documents#!/mine"
                        class="flex items-center gap-2"
                      >
                        Dokumen Saya
                        <span
                          class="badge badge-xs badge-ghost font-mono ml-auto"
                        >
                          {statusCounts.mine}
                        </span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="/me/documents#!/request"
                        class="flex items-center gap-2"
                      >
                        Perlu Ditandatangani
                        <span
                          class="badge badge-xs badge-ghost font-mono ml-auto"
                        >
                          {statusCounts.requests}
                        </span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="/me/documents#!/signed"
                        class="flex items-center gap-2"
                      >
                        Riwayat Tanda Tangan Saya
                        <span
                          class="badge badge-xs badge-ghost font-mono ml-auto"
                        >
                          {statusCounts.signed}
                        </span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="/me/documents/administrative"
                        class="flex items-center gap-2"
                      >
                        Dokumen Administratif
                        <span
                          class="badge badge-xs badge-ghost font-mono ml-auto"
                        >
                          {statusCounts.administrative}
                        </span>
                      </a>
                    </li>
                    <li><a href="/profile">Profil Saya</a></li>
                    <li><a href="/me/templates">Kelola Template</a></li>
                  </ul>
                </details>
              </li>
              {#if user.role?.name === "admin"}
                <li>
                  <details>
                    <summary>Administrasi</summary>
                    <ul>
                      <li><a href="/main">Dashboard Admin</a></li>
                      <li>
                        <a href="/main/users" class="flex items-center gap-2">
                          Daftar Pengguna
                          <span
                            class="badge badge-xs badge-ghost font-mono ml-auto"
                          >
                            {adminCounts.users}
                          </span>
                        </a>
                      </li>
                      <li>
                        <a href="/main/logs" class="flex items-center gap-2">
                          Log Aktivitas
                          <span
                            class="badge badge-xs badge-ghost font-mono ml-auto"
                          >
                            {adminCounts.logs}
                          </span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/main/portal-bsre"
                          class="flex items-center gap-2"
                        >
                          Portal BSrE
                          <span
                            class="badge badge-xs badge-ghost font-mono ml-auto"
                          >
                            {adminCounts.bsreUsers}
                          </span>
                        </a>
                      </li>
                      <li>
                        <a href="/main/survey" class="flex items-center gap-2">
                          Survey Kepuasan
                          <span
                            class="badge badge-xs badge-ghost font-mono ml-auto"
                          >
                            {adminCounts.surveys}
                          </span>
                        </a>
                      </li>
                    </ul>
                  </details>
                </li>
              {/if}
            {/if}
          </ul>
        </div>
        <a class="btn btn-ghost text-xl px-0 h-15" href="/" aria-label="Logo">
          <Lottie url="/asta-themed.json" loop autoplay />
        </a>
      </div>

      <div class="navbar-center hidden lg:flex">
        <ul class="menu menu-horizontal px-1 gap-1">
          <li
            onmouseenter={() => showMenu("beranda")}
            onmouseleave={scheduleHide}
          >
            <a
              href="/"
              class="rounded-lg text-xs font-medium transition-all"
              class:bg-primary={page.url.pathname === "/"}
              class:text-primary-content={page.url.pathname === "/"}
              class:shadow-sm={page.url.pathname === "/"}
              class:bg-base-200={activeMenu === "beranda" &&
                page.url.pathname !== "/"}
              class:text-base-content={activeMenu === "beranda" &&
                page.url.pathname !== "/"}
            >
              Beranda
            </a>
          </li>
          <li onmouseenter={() => showMenu("sign")} onmouseleave={scheduleHide}>
            <a
              href="/sign"
              class="rounded-lg text-xs font-medium transition-all"
              class:bg-primary={page.url.pathname === "/sign"}
              class:text-primary-content={page.url.pathname === "/sign"}
              class:shadow-sm={page.url.pathname === "/sign"}
              class:bg-base-200={activeMenu === "sign" &&
                page.url.pathname !== "/sign"}
              class:text-base-content={activeMenu === "sign" &&
                page.url.pathname !== "/sign"}
            >
              Tanda Tangan
            </a>
          </li>
          <li
            onmouseenter={() => showMenu("verify")}
            onmouseleave={scheduleHide}
          >
            <a
              href="/verify"
              class="rounded-lg text-xs font-medium transition-all"
              class:bg-primary={page.url.pathname === "/verify"}
              class:text-primary-content={page.url.pathname === "/verify"}
              class:shadow-sm={page.url.pathname === "/verify"}
              class:bg-base-200={activeMenu === "verify" &&
                page.url.pathname !== "/verify"}
              class:text-base-content={activeMenu === "verify" &&
                page.url.pathname !== "/verify"}
            >
              Verifikasi
            </a>
          </li>
          {#if user}
            <li onmouseenter={() => showMenu("me")} onmouseleave={scheduleHide}>
              <a
                href="/me"
                class="rounded-lg text-xs font-medium transition-all"
                class:bg-primary={isMeActive}
                class:text-primary-content={isMeActive}
                class:shadow-sm={isMeActive}
                class:bg-base-200={activeMenu === "me" && !isMeActive}
                class:text-base-content={activeMenu === "me" && !isMeActive}
              >
                Dashboard
              </a>
            </li>
          {/if}
          {#if user?.role?.name === "admin"}
            <li
              onmouseenter={() => showMenu("manage")}
              onmouseleave={scheduleHide}
            >
              <a
                href="/main"
                class="rounded-lg text-xs font-medium transition-all"
                class:bg-primary={isManageActive}
                class:text-primary-content={isManageActive}
                class:shadow-sm={isManageActive}
                class:bg-base-200={activeMenu === "manage" && !isManageActive}
                class:text-base-content={activeMenu === "manage" &&
                  !isManageActive}
              >
                Administrasi
              </a>
            </li>
          {/if}
        </ul>
      </div>

      <div class="navbar-end gap-5">
        {#if ["/sign", "/verify", "/me", "/main"].includes(page.url.pathname)}
          <button
            class="btn btn-ghost btn-sm gap-1 relative animate-pulse"
            onclick={() => (app.showTour = true)}
          >
            <iconify-icon icon="bx:help-circle" class="text-xl"></iconify-icon>
            <span class="hidden md:inline">Panduan</span>
          </button>
        {/if}
        <label class="swap swap-rotate">
          <input
            type="checkbox"
            onchange={(e) => {
              const checked = (e.target as HTMLInputElement).checked;
              app.theme = checked ? "dark" : "light";
            }}
            checked={app.theme === "dark"}
          />
          <iconify-icon icon="bx:sun" class="swap-off fill-current w-10"
          ></iconify-icon>
          <iconify-icon icon="bx:moon" class="swap-on fill-current w-10"
          ></iconify-icon>
        </label>
        {#if user}
          <div class="dropdown dropdown-end">
            <div tabindex="0" role="button" class="btn btn-ghost">
              <div class="indicator">
                {#if data.impersonated}
                  <span class="indicator-item badge badge-warning badge-xs mt-1"
                    >impersonate</span
                  >
                {/if}
                <div class="avatar rounded-full bg-secondary w-12 -ml-6">
                  <img src="/ava.svg" alt={user.email} />
                </div>
              </div>
              <div>
                <div>
                  {user.email?.split("@")[0]}
                </div>
              </div>
            </div>
            <ul
              tabindex="-1"
              class="dropdown-content menu bg-base-100 rounded-box z-1 w-48 mt-3 p-2 shadow-sm"
            >
              <li class="menu-title uppercase">{user.role?.name}</li>
              {#if user.role?.name === "admin"}
                <li>
                  <a href="/main">
                    <iconify-icon icon="bx:bxs-dashboard" class="mr-2"
                    ></iconify-icon>
                    Dashboard
                  </a>
                </li>
              {/if}
              <li>
                <a href="/me">
                  <iconify-icon icon="bx:bar-chart-square" class="mr-2"
                  ></iconify-icon>
                  Overview
                </a>
              </li>
              <li>
                <a href="/me/documents">
                  <iconify-icon icon="bx:file" class="mr-2"></iconify-icon>
                  Dokumen Saya
                </a>
              </li>
              <li>
                <a href="/profile">
                  <iconify-icon icon="bx:user" class="mr-2"></iconify-icon>
                  Profil
                </a>
              </li>
              <li>
                <a href={`${data.baseURLSSO}/account`} target="_blank">
                  <iconify-icon icon="bx:cog" class="mr-2"></iconify-icon>
                  Account
                </a>
              </li>
              {#if data.impersonated}
                <li></li>
                <li>
                  <button
                    onclick={() => {
                      document.cookie = "impersonate-token=; path=/; max-age=0";
                      window.location.href = "/main/users";
                    }}
                  >
                    <iconify-icon icon="bx:exit-fullscreen" class="mr-2"
                    ></iconify-icon>
                    Kembali ke Admin
                  </button>
                </li>
              {/if}
              <li></li>
              <li>
                <a href="/auth/logout">
                  <iconify-icon icon="bx:log-out" class="mr-2"></iconify-icon>
                  Logout
                </a>
              </li>
            </ul>
          </div>
        {:else}
          <a href="/auth/openid" class="btn btn-primary btn-soft">Masuk</a>
        {/if}
      </div>
    </div>

    {#if activeMenu}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        transition:fly={{ y: -8, duration: 150, opacity: 0 }}
        class="absolute left-0 right-0 bg-base-100 border-b border-base-200 shadow-xl z-20"
        onmouseenter={() => {
          if (activeMenu) showMenu(activeMenu);
        }}
        onmouseleave={scheduleHide}
      >
        {#if activeMenu === "beranda"}
          <div class="mx-auto px-6 lg:px-12 py-8">
            <div class="grid grid-cols-3 gap-8 items-start">
              <div>
                <h3
                  class="font-bold text-lg text-primary flex items-center gap-2"
                >
                  <iconify-icon icon="bx:home-alt" class="text-xl"
                  ></iconify-icon>
                  Tapak Astà
                </h3>
                <p class="text-xs opacity-70 mt-2 leading-relaxed">
                  Platform tanda tangan elektronik terpercaya, aman, dan sah
                  untuk Anda.
                </p>
                <a href="/" class="btn btn-primary btn-sm mt-4 gap-1">
                  <span>Ke Beranda</span>
                  <iconify-icon icon="bx:right-arrow-alt"></iconify-icon>
                </a>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Navigasi Utama
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname === '/'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Beranda Utama</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/user-guide"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/user-guide'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/user-guide'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Panduan Pengguna</span>
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Bantuan & Legalitas
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/user-guide#faq"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page.url.pathname.includes(
                        '#faq',
                      )
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname.includes(
                          '#faq',
                        )
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Pertanyaan Umum (FAQ)</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/user-guide#legal"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page.url.pathname.includes(
                        '#legal',
                      )
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname.includes(
                          '#legal',
                        )
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Legalitas Hukum TTE</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "sign"}
          <div class="mx-auto px-6 lg:px-12 py-8">
            <div class="grid grid-cols-3 gap-8 items-start">
              <div>
                <h3
                  class="font-bold text-lg text-primary flex items-center gap-2"
                >
                  <iconify-icon icon="bx:pen" class="text-xl"></iconify-icon>
                  Tanda Tangan TTE
                </h3>
                <p class="text-xs opacity-70 mt-2 leading-relaxed">
                  Tandatanganan dokumen secara elektronik terintegrasi langsung
                  dengan BSrE BSSN.
                </p>
                <a href="/sign" class="btn btn-primary btn-sm mt-4 gap-1">
                  <span>Mulai Tanda Tangan</span>
                  <iconify-icon icon="bx:pencil"></iconify-icon>
                </a>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Fitur Tanda Tangan
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/sign"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/sign'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/sign'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Upload & Tanda Tangan</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/templates"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/templates'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/templates'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Template Dokumen</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="#devel"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/templates'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/templates'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Buat Dokumen (dalam pengembangan)</span>
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Layanan Mandiri
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/services/register"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/services/register'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/services/register'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Registrasi Layanan dan Bantuan TTE</span>
                    </a>
                  </li>

                  <li>
                    <a
                      href="https://mail.mojokertokota.go.id"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 text-base-content/75"
                    >
                      <iconify-icon
                        icon="bx:link-external"
                        class="text-xs opacity-40 group-hover:opacity-100 transition-all"
                      ></iconify-icon>
                      <span>Email Dinas Pemerintah Kota Mojokerto</span>
                      <iconify-icon
                        icon="bx:external-link"
                        class="ml-auto text-[10px] opacity-40"
                      ></iconify-icon>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://bsre.bssn.go.id/"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 text-base-content/75"
                    >
                      <iconify-icon
                        icon="bx:link-external"
                        class="text-xs opacity-40 group-hover:opacity-100 transition-all"
                      ></iconify-icon>
                      <span>Website BSrE BSSN</span>
                      <iconify-icon
                        icon="bx:external-link"
                        class="ml-auto text-[10px] opacity-40"
                      ></iconify-icon>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "verify"}
          <div class="mx-auto px-6 lg:px-12 py-8">
            <div class="grid grid-cols-3 gap-8 items-start">
              <div>
                <h3
                  class="font-bold text-lg text-primary flex items-center gap-2"
                >
                  <iconify-icon icon="bx:check-shield" class="text-xl"
                  ></iconify-icon>
                  Verifikasi Sah
                </h3>
                <p class="text-xs opacity-70 mt-2 leading-relaxed">
                  Periksa keaslian dokumen PDF dan sertifikat digital tanda
                  tangan elektronik Anda.
                </p>
                <a href="/verify" class="btn btn-primary btn-sm mt-4 gap-1">
                  <span>Mulai Verifikasi</span>
                  <iconify-icon icon="bx:search"></iconify-icon>
                </a>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Metode Pemeriksaan
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/verify"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/verify' &&
                      !page.url.hash.startsWith('#!')
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                          '/verify' && !page.url.hash.startsWith('#!')
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Unggah File PDF</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/verify#!/id"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/verify' && page.url.hash === '#!/id'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                          '/verify' && page.url.hash === '#!/id'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Cari Berdasarkan ID</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/verify#!/scan"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/verify' &&
                      page.url.hash === '#!/scan'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                          '/verify' && page.url.hash === '#!/scan'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Pindai QR Code TTE</span>
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Validitas Sertifikat
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="https://cekdokumen.id/"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 text-base-content/75"
                    >
                      <iconify-icon
                        icon="bx:link-external"
                        class="text-xs opacity-40 group-hover:opacity-100 transition-all"
                      ></iconify-icon>
                      <span>Verifikasi PDF - Cek Dokumen</span>
                      <iconify-icon
                        icon="bx:external-link"
                        class="ml-auto text-[10px] opacity-40"
                      ></iconify-icon>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://tte.komdigi.go.id/verifyPDF"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 text-base-content/75"
                    >
                      <iconify-icon
                        icon="bx:link-external"
                        class="text-xs opacity-40 group-hover:opacity-100 transition-all"
                      ></iconify-icon>
                      <span>Verifikasi PDF - Komdigi</span>
                      <iconify-icon
                        icon="bx:external-link"
                        class="ml-auto text-[10px] opacity-40"
                      ></iconify-icon>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://bsre.bssn.go.id/pdf-verification"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 text-base-content/75"
                    >
                      <iconify-icon
                        icon="bx:link-external"
                        class="text-xs opacity-40 group-hover:opacity-100 transition-all"
                      ></iconify-icon>
                      <span>Verifikasi PDF - BSrE BSSN</span>
                      <iconify-icon
                        icon="bx:external-link"
                        class="ml-auto text-[10px] opacity-40"
                      ></iconify-icon>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "me"}
          <div class="mx-auto px-6 lg:px-12 py-8">
            <div class="grid grid-cols-3 gap-8 items-start">
              <div>
                <h3
                  class="font-bold text-lg text-primary flex items-center gap-2"
                >
                  <iconify-icon icon="bx:user-circle" class="text-xl"
                  ></iconify-icon>
                  Data Saya
                </h3>
                <p class="text-xs opacity-70 mt-2 leading-relaxed">
                  Kelola profil pengguna, histori dokumen yang Anda buat, dan
                  templates surat Anda.
                </p>
                <a href="/me" class="btn btn-primary btn-sm mt-4 gap-1">
                  <span>Dashboard Saya</span>
                  <iconify-icon icon="bx:layout"></iconify-icon>
                </a>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Dokumen
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/me/documents#!/mine"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/me/documents' &&
                      page.url.hash === '#!/mine'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                          '/me/documents' && page.url.hash === '#!/mine'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Dokumen Saya</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/me/documents' &&
                        page.url.hash === '#!/mine'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {statusCounts.mine}
                      </span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/me/documents#!/request"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/me/documents' &&
                      page.url.hash === '#!/request'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                          '/me/documents' && page.url.hash === '#!/request'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Perlu Ditandatangani</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/me/documents' &&
                        page.url.hash === '#!/request'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {statusCounts.requests}
                      </span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/me/documents#!/signed"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/me/documents' &&
                      page.url.hash === '#!/signed'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                          '/me/documents' && page.url.hash === '#!/signed'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Riwayat Tanda Tangan Saya</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/me/documents' &&
                        page.url.hash === '#!/signed'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {statusCounts.signed}
                      </span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/me/documents/administrative"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/me/documents/administrative'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/me/documents/administrative'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Dokumen Administratif</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/me/documents/administrative'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {statusCounts.administrative}
                      </span>
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Konfigurasi
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/profile"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/profile'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/profile'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Profil Saya</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/me/templates"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/me/templates'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/me/templates'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Kelola Template</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "manage"}
          <div class="mx-auto px-6 lg:px-12 py-8">
            <div class="grid grid-cols-3 gap-8 items-start">
              <div>
                <h3
                  class="font-bold text-lg text-primary flex items-center gap-2"
                >
                  <iconify-icon icon="bx:cog" class="text-xl"></iconify-icon>
                  Administrasi
                </h3>
                <p class="text-xs opacity-70 mt-2 leading-relaxed">
                  Akses panel administrator untuk mengelola hak akses pengguna,
                  integrasi sistem, and log audit.
                </p>
                <a href="/main" class="btn btn-primary btn-sm mt-4 gap-1">
                  <span>Ke Dashboard Admin</span>
                  <iconify-icon icon="bx:server"></iconify-icon>
                </a>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Sistem & User
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/main/users"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/main/users'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/main/users'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Daftar Pengguna</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/main/users'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {adminCounts.users}
                      </span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/main/logs"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/main/logs'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/main/logs'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Log Aktivitas</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/main/logs'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {adminCounts.logs}
                      </span>
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4
                  class="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider"
                >
                  Integrasi
                </h4>
                <ul class="space-y-1">
                  <li>
                    <a
                      href="/main/portal-bsre"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/main/portal-bsre'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/main/portal-bsre'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Portal BSrE</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/main/portal-bsre'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {adminCounts.bsreUsers}
                      </span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="/main/survey"
                      class="group link link-hover text-xs flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all hover:text-primary hover:bg-primary/5 hover:translate-x-1 {page
                        .url.pathname === '/main/survey'
                        ? 'text-primary font-bold bg-primary/5'
                        : 'text-base-content/75'}"
                    >
                      <iconify-icon
                        icon="bx:chevron-right"
                        class="text-xs transition-all {page.url.pathname ===
                        '/main/survey'
                          ? 'text-primary opacity-100'
                          : 'opacity-40 group-hover:opacity-100'}"
                      ></iconify-icon>
                      <span>Survey Kepuasan</span>
                      <span
                        class="ml-auto badge badge-xs font-mono {page.url
                          .pathname === '/main/survey'
                          ? 'badge-primary'
                          : 'badge-ghost'}"
                      >
                        {adminCounts.surveys}
                      </span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="background">
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
    <span></span>
  </div>

  <div class="flex-1 min-h-0 relative z-1 overflow-y-auto bg-base-100">
    {@render children()}
  </div>

  <Chatbot {user} />
</div>

<!-- <div class="cf-turnstile" data-sitekey={env.PUBLIC_TURNSTILE_KEY}></div> -->
