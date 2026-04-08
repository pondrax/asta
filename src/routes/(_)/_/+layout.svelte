<script lang="ts">
  import { page } from "$app/state";
  let { children } = $props();

  const navs = [
    { href: "/_/collections", icon: "bx:data", label: "Collections" },
    { href: "/_/designer", icon: "bx:wrench", label: "Designer" },
    { href: "/_/logs", icon: "bx:history", label: "Logs" },
    { href: "/_/settings", icon: "bx:cog", label: "Settings" },
  ];
</script>

<div class="flex w-full h-screen overflow-hidden bg-base-100">
  <!-- Admin Global Sidebar (Small Icon Version) -->
  <aside
    class="w-16 flex flex-col items-center py-6 bg-base-100 border-r border-base-300 z-50"
  >
    <!-- Brand -->
    <div class="mb-10">
      <div
        class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-content shadow-lg shadow-primary/20"
      >
        <iconify-icon icon="bx:layer" class="text-2xl"></iconify-icon>
      </div>
    </div>

    <!-- Navigation Icons -->
    <nav class="flex-1 flex flex-col gap-5">
      {#each navs as nav}
        <div class="tooltip tooltip-right" data-tip={nav.label}>
          <a
            href={nav.href}
            aria-label={nav.label}
            class="btn btn-ghost btn-square btn-md {page.url.pathname.startsWith(
              nav.href
            )
              ? 'btn-active bg-primary/10 text-primary'
              : 'opacity-40 hover:opacity-100'}"
          >
            <iconify-icon icon={nav.icon} class="text-2xl"></iconify-icon>
          </a>
        </div>
      {/each}
    </nav>

    <!-- Bottom Actions -->
    <div class="mt-auto">
      <div class="tooltip tooltip-right" data-tip="Go Back">
        <a
          href="/"
          aria-label="Go Back"
          class="btn btn-ghost btn-square btn-md opacity-40 hover:opacity-100"
        >
          <iconify-icon icon="bx:arrow-back" class="text-2xl"></iconify-icon>
        </a>
      </div>
    </div>
  </aside>

  <!-- Main Viewport -->
  <main class="flex-1 min-w-0 h-full relative">
    {@render children()}
  </main>
</div>

<style>
  /* Ensure tooltips are readable and above other sidebars */
  :global(.tooltip) {
    --tooltip-color: var(--color-base-content);
    --tooltip-text-color: var(--color-base-100);
  }
</style>
