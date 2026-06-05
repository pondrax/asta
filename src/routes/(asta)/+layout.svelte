<script lang="ts">
  import { fly } from "svelte/transition";
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";
  import { app } from "$lib/app/index.svelte";
  import Lottie from "$lib/components/lottie.svelte";
  let { children, data } = $props();

  const user = $derived(data.user);

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
</script>

<svelte:head>
  <title>Tapak Astà</title>
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
            class="menu dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow"
          >
            <li><a href="/">Beranda</a></li>
            <li><a href="/sign">Tanda Tangan</a></li>
            <li><a href="/verify">Verifikasi</a></li>
            {#if user}
              <li class="menu-title mt-2">Overview</li>
              <li><a href="/me">Overview</a></li>
              <li><a href="/me/documents">Dokumen Saya</a></li>
              <li><a href="/profile">Profil</a></li>
              {#if user.role?.name === "admin"}
                <li><a href="/templates">Templates</a></li>
              {/if}
              {#if user.role?.name === "admin"}
                <li class="menu-title mt-2">Administration</li>
                <li><a href="/main">Dashboard</a></li>
                <li><a href="/main/users">Users</a></li>
                <li><a href="/main/logs">Logs</a></li>
                <li><a href="/main/portal-bsre">BSrE Portal</a></li>
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
            <a href="/" class:menu-active={page.url.pathname === "/"}>
              Beranda
            </a>
          </li>
          <li onmouseenter={() => showMenu("sign")} onmouseleave={scheduleHide}>
            <a href="/sign" class:menu-active={page.url.pathname === "/sign"}>
              Tanda Tangan
            </a>
          </li>
          <li
            onmouseenter={() => showMenu("verify")}
            onmouseleave={scheduleHide}
          >
            <a
              href="/verify"
              class:menu-active={page.url.pathname === "/verify"}
            >
              Verifikasi
            </a>
          </li>
          {#if user}
            <li onmouseenter={() => showMenu("me")} onmouseleave={scheduleHide}>
              <a href="/me" class:menu-active={isMeActive}> Overview </a>
            </li>
          {/if}
          {#if user?.role?.name === "admin"}
            <li
              onmouseenter={() => showMenu("manage")}
              onmouseleave={scheduleHide}
            >
              <a href="/main" class:menu-active={isManageActive}>
                Administration
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
            <span>Panduan</span>
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
              <div class="avatar rounded-full bg-secondary w-12 -ml-6">
                <img src="/ava.svg" alt={user.email} />
              </div>
              <div>{user.email?.split("@")[0]}</div>
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
        class="absolute left-0 right-0 bg-base-100 shadow-lg z-20"
        onmouseenter={() => {
          if (activeMenu) showMenu(activeMenu);
        }}
        onmouseleave={scheduleHide}
      >
        {#if activeMenu === "beranda"}
          <div class="max-w-screen-xl mx-auto px-4 lg:px-8 py-6">
            <div class="flex gap-8 items-start">
              <div class="flex-1">
                <h3 class="font-bold text-lg">Selamat Datang di Tapak Astà</h3>
                <p class="text-sm opacity-70 mt-1">
                  Platform tanda tangan elektronik terpercaya
                </p>
                <a href="/" class="btn btn-primary btn-sm mt-4">Ke Beranda</a>
              </div>
              <div class="flex-1">
                <h4 class="font-semibold mb-2">Menu Utama</h4>
                <ul class="space-y-1">
                  <li><a href="/" class="link link-hover">Beranda</a></li>
                  <li>
                    <a href="/user-guide" class="link link-hover">Panduan</a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "sign"}
          <div class="max-w-screen-xl mx-auto px-4 lg:px-8 py-6">
            <div class="flex gap-8 items-start">
              <div class="flex-1">
                <h3 class="font-bold text-lg">Tanda Tangan Elektronik</h3>
                <p class="text-sm opacity-70 mt-1">
                  Tanda tangani dokumen Anda secara digital dengan aman dan sah.
                </p>
                <a href="/sign" class="btn btn-primary btn-sm mt-4"
                  >Mulai Tanda Tangan</a
                >
              </div>
              <div class="flex-1">
                <h4 class="font-semibold mb-2">Fitur</h4>
                <ul class="space-y-1">
                  <li>
                    <a href="/sign" class="link link-hover"
                      >Upload & Tanda Tangan</a
                    >
                  </li>
                  <li>
                    <a href="/services/register" class="link link-hover"
                      >Registrasi Layanan</a
                    >
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "verify"}
          <div class="max-w-screen-xl mx-auto px-4 lg:px-8 py-6">
            <div class="flex gap-8 items-start">
              <div class="flex-1">
                <h3 class="font-bold text-lg">Verifikasi Dokumen</h3>
                <p class="text-sm opacity-70 mt-1">
                  Verifikasi keaslian dan validitas dokumen elektronik Anda.
                </p>
                <a href="/verify" class="btn btn-primary btn-sm mt-4"
                  >Mulai Verifikasi</a
                >
              </div>
              <div class="flex-1">
                <h4 class="font-semibold mb-2">Fitur</h4>
                <ul class="space-y-1">
                  <li>
                    <a href="/verify" class="link link-hover"
                      >Verifikasi Dokumen</a
                    >
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "me"}
          <div class="max-w-screen-xl mx-auto px-4 lg:px-8 py-6">
            <div class="flex gap-8 items-start">
              <div class="flex-1">
                <h3 class="font-bold text-lg">Akun Saya</h3>
                <p class="text-sm opacity-70 mt-1">
                  Kelola akun dan dokumen Anda.
                </p>
              </div>
              <div class="flex-1">
                <h4 class="font-semibold mb-2">Menu</h4>
                <ul class="space-y-1">
                  <li><a href="/me" class="link link-hover">Overview</a></li>
                  <li>
                    <a href="/me/documents" class="link link-hover"
                      >Dokumen Saya</a
                    >
                  </li>
                  <li><a href="/profile" class="link link-hover">Profil</a></li>
                  <li>
                    <a href="/templates" class="link link-hover">Templates</a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        {:else if activeMenu === "manage"}
          <div class="max-w-screen-xl mx-auto px-4 lg:px-8 py-6">
            <div class="flex gap-8 items-start">
              <div class="flex-1">
                <h3 class="font-bold text-lg">Manajemen Sistem</h3>
                <p class="text-sm opacity-70 mt-1">
                  Panel administrasi untuk mengelola sistem.
                </p>
              </div>
              <div class="flex-1">
                <h4 class="font-semibold mb-2">Menu</h4>
                <ul class="space-y-1">
                  <li><a href="/main" class="link link-hover">Dashboard</a></li>
                  <li>
                    <a href="/main/users" class="link link-hover">Users</a>
                  </li>
                  <li><a href="/main/logs" class="link link-hover">Logs</a></li>
                </ul>
              </div>
              <div class="flex-1">
                <h4 class="font-semibold mb-2">Lainnya</h4>
                <ul class="space-y-1">
                  <li>
                    <a href="/main/portal-bsre" class="link link-hover"
                      >BSrE Portal</a
                    >
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

  <div class="flex-1 min-h-0 relative z-1 overflow-y-auto">
    {@render children()}
  </div>
</div>

<!-- <div class="cf-turnstile" data-sitekey={env.PUBLIC_TURNSTILE_KEY}></div> -->
