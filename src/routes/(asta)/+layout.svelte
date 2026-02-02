<script lang="ts">
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";
  import { app } from "$lib/app/index.svelte";
  import Lottie from "$lib/components/lottie.svelte";
  let { children, data } = $props();

  const user = $derived(data.user);
  // console.log(data);
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

<div class="navbar bg-base-100 sticky top-0 lg:px-5 z-10">
  <div class="navbar-start">
    <div class="dropdown">
      <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
        <iconify-icon icon="bx:menu-alt-left" class="text-2xl"></iconify-icon>
      </div>
      <ul
        tabindex="-1"
        class="menu dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow"
      >
        <li><a href="/sign">Tanda Tangan</a></li>
        <li><a href="/verify">Verifikasi</a></li>
        <li><a href="/user-guide">Panduan</a></li>
      </ul>
    </div>
    <a class="btn btn-ghost text-xl px-0 h-15" href="/" aria-label="Logo">
      <Lottie url="/asta-themed.json" loop autoplay />
    </a>
  </div>
  <div class="navbar-center hidden lg:flex">
    <ul class="menu menu-horizontal px-1 gap-1">
      <li>
        <a href="/" class:menu-active={page.url.pathname === "/"}> Beranda </a>
      </li>
      <li>
        <a href="/sign" class:menu-active={page.url.pathname === "/sign"}>
          Tanda Tangan
        </a>
      </li>
      <li>
        <a href="/verify" class:menu-active={page.url.pathname === "/verify"}>
          Verifikasi
        </a>
      </li>
      <li>
        <a
          href="/user-guide"
          class:menu-active={page.url.pathname === "/user-guide"}
        >
          Panduan
        </a>
      </li>
      {#if user}
        <li>
          <a
            href="/me/documents"
            class:menu-active={page.url.pathname === "/me/documents"}
          >
            Dokumen Saya
          </a>
        </li>
      {/if}
    </ul>
  </div>
  <div class="navbar-end gap-5">
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
            <img src="/ava.svg" alt={user.name} />
          </div>
          <div>{user.email?.split("@")[0]}</div>
        </div>
        <ul
          tabindex="-1"
          class="dropdown-content menu bg-base-100 rounded-box z-1 w-48 mt-3 p-2 shadow-sm"
        >
          <li>
            <a href="/me">
              <iconify-icon icon="bx:bxs-dashboard" class="mr-2"></iconify-icon>
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
            <a href={`${data.baseURLSSO}/account`} target="_blank">
              <iconify-icon icon="bx:user" class="mr-2"></iconify-icon>
              Profil
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

<div class="relative z-1">
  {@render children()}
</div>

<!-- <div class="cf-turnstile" data-sitekey={env.PUBLIC_TURNSTILE_KEY}></div> -->
