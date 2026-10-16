<script lang="ts">
  import { workspace } from "$lib/app/sign-workspace.svelte";

  let openId = $state<string | null>(null);

  function close() {
    openId = null;
  }
</script>

<svelte:window
  onclick={close}
  onkeydown={(e) => {
    if (e.key === "Escape") close();
  }}
/>

<div class="flex items-center h-8 shrink-0 ml-0 md:ml-5">
  {#each workspace.menus as menu (menu.id)}
    <div
      class="relative h-full"
      role="none"
      onmouseenter={() => (openId = menu.id)}
      onmouseleave={close}
    >
      <button
        type="button"
        class={menu.variant === "primary"
          ? `btn btn-sm btn-soft btn-primary rounded-full justify-between gap-1 ${menu.width ?? ""}`
          : `h-full px-3 rounded-full text-xs text-base-content cursor-pointer border-0 ${openId === menu.id ? "bg-base-200" : "bg-transparent hover:bg-base-200"}`}
        aria-haspopup="true"
        aria-expanded={openId === menu.id}
        onclick={(e) => {
          e.stopPropagation();
          openId = openId === menu.id ? null : menu.id;
        }}
      >
        {#if menu.variant === "primary"}
          <span class="flex-1 text-center">{menu.label}</span>
          <iconify-icon
            icon="bx:chevron-down"
            width="14"
            height="14"
            class="opacity-80"
          ></iconify-icon>
        {:else}
          {menu.label}
        {/if}
      </button>
      <!-- Pseudo-element bridges the 4px gap so hover carries into the popup. -->
      <div
        class="absolute left-0 top-[calc(100%+4px)] min-w-60 py-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-[60]
          before:content-[''] before:absolute before:-top-1 before:left-0 before:right-0 before:h-1
          {openId === menu.id ? 'block' : 'hidden'}"
        role="menu"
        tabindex="-1"
      >
        {#each menu.items as item, i (i)}
          {#if item === "sep"}
            <div class="h-px my-1 bg-base-300"></div>
          {:else if item.href}
            <a
              class="flex items-center gap-2.5 w-full min-h-8 px-3 text-[13px] text-base-content no-underline cursor-pointer hover:bg-base-200"
              role="menuitem"
              href={item.href}
            >
              <span
                class="flex size-4 shrink-0 items-center justify-center text-[16px] leading-none opacity-70"
              >
                <iconify-icon icon={item.icon}></iconify-icon>
              </span>
              <span class="text-[13px] leading-none">{item.label}</span>
              {#if item.badge}
                <span
                  class="ml-auto text-[10px] px-1.5 py-px rounded-full bg-primary text-primary-content"
                  >{item.badge}</span
                >
              {/if}
            </a>
          {:else}
            <button
              class="flex items-center gap-2.5 w-full min-h-8 px-3 text-left text-[13px] text-base-content border-0 bg-transparent cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default"
              role="menuitem"
              disabled={item.disabled}
              onclick={() => {
                close();
                item.action?.();
              }}
            >
              <span
                class="flex size-4 shrink-0 items-center justify-center text-[16px] leading-none opacity-70"
              >
                <iconify-icon icon={item.icon}></iconify-icon>
              </span>
              <span class="text-[13px] leading-none">{item.label}</span>
              {#if item.shortcut}
                <span class="ml-auto text-[11px] opacity-50">{item.shortcut}</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>
