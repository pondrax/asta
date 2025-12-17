<script lang="ts">
  import { page } from "$app/state";
  import { app } from "$lib/app/index.svelte";
  let { children } = $props();
</script>

<svelte:head>
  <title>Tapak Astà</title>
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
        <li>
          <a href="/auth" class="btn btn-sm btn-primary btn-soft mt-2">Masuk</a>
        </li>
      </ul>
    </div>
    <a class="btn btn-ghost text-xl px-0" href="/" aria-label="Logo">
      <img src="/logo-white.png" alt="logo" class="h-12 dark-logo" />
      <img src="/logo.png" alt="logo" class="h-12 light-logo" />
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
    <button class="btn btn-primary btn-soft">Masuk</button>
  </div>
</div>

<div>
  {@render children()}
</div>
