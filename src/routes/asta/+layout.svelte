<script lang="ts">
  import { app } from "$lib/app/index.svelte";
  let { children } = $props();
</script>

<svelte:head>
  <title>Tapak Astà</title>
</svelte:head>

<div class="navbar bg-base-100 sticky top-0 lg:px-5 z-1">
  <div class="navbar-start">
    <div class="dropdown">
      <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
        <iconify-icon icon="bx:menu-alt-left" class="text-2xl"></iconify-icon>
      </div>
      <ul
        tabindex="-1"
        class="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow"
      >
        <li><a href="/asta/sign">Tanda Tangan</a></li>
        <!-- <li>
          <div>Parent</div>
          <ul class="p-2">
            <li><a href="/">Submenu 1</a></li>
            <li><a href="/">Submenu 2</a></li>
          </ul>
        </li>
        <li><a>Item 3</a></li> -->
      </ul>
    </div>
    <a class="btn btn-ghost text-xl px-0" href="/asta" aria-label="Logo">
      <img src="/logo-white.png" alt="logo" class="h-12 dark-logo" />
      <img src="/logo.png" alt="logo" class="h-12 light-logo" />
    </a>
  </div>
  <div class="navbar-center hidden lg:flex">
    <ul class="menu menu-horizontal px-1">
      <li>
        <a href="/asta" class=""> Beranda </a>
      </li>
      <li>
        <a href="/asta/sign"> Tanda Tangan </a>
      </li>
      <!-- <li>
        <details>
          <summary>Parent</summary>
          <ul class="p-2">
            <li><a>Submenu 1</a></li>
            <li><a>Submenu 2</a></li>
          </ul>
        </details>
      </li> -->
      <li><a href="/asta/auth"> Panduan </a></li>
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
