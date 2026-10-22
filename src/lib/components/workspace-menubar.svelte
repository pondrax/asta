<script lang="ts">
  import { onMount } from "svelte";
  import { workspace } from "$lib/app/sign-workspace.svelte";

  let openId = $state<string | null>(null);
  let small = $state(false);
  let pos = $state({ top: 48 });

  function close() {
    openId = null;
  }

  /**
   * On small screens the bar is a horizontal scroller, which would clip an
   * absolutely-positioned dropdown. Pin it to the viewport instead, right under
   * the trigger that opened it.
   */
  function anchor(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    pos = { top: rect.bottom + 4 };
  }

  onMount(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const update = () => (small = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  });
</script>

<svelte:window
  onclick={close}
  onkeydown={(e) => {
    if (e.key === "Escape") close();
  }}
/>

<div
  class="no-scrollbar flex items-center h-8 shrink-0 ml-0 md:ml-5 max-lg:mb-1 max-lg:overflow-x-auto max-lg:overflow-y-hidden"
>
  {#each workspace.menus as menu (menu.id)}
    <div
      class="relative h-full shrink-0"
      role="none"
      onmouseenter={(e) => {
        openId = menu.id;
        anchor(e);
      }}
      onmouseleave={close}
    >
      <button
        type="button"
        id={menu.id === "mode" ? "tour-mode" : undefined}
        class={menu.variant === "primary"
          ? `btn btn-sm btn-soft btn-primary rounded-full justify-between gap-0.5 [--btn-p:0.375rem] ${menu.width ?? ""}`
          : `h-full px-3 rounded-full text-xs text-base-content cursor-pointer border-0 ${openId === menu.id ? "bg-base-200" : "bg-transparent hover:bg-base-200"}`}
        aria-haspopup="true"
        aria-expanded={openId === menu.id}
        onclick={(e) => {
          e.stopPropagation();
          if (openId === menu.id) {
            openId = null;
          } else {
            openId = menu.id;
            anchor(e);
          }
        }}
      >
        {#if menu.variant === "primary"}
          <span class="flex-1 text-center whitespace-nowrap">{menu.label}</span>
          <iconify-icon
            icon="bx:chevron-down"
            width="12"
            height="12"
            class="opacity-80"
          ></iconify-icon>
        {:else}
          {menu.label}
        {/if}
      </button>
      <!-- Pseudo-element bridges the 4px gap so hover carries into the popup. -->
      <div
        class="min-w-60 py-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-[70]
          before:content-[''] before:absolute before:-top-1 before:left-0 before:right-0 before:h-1
          max-lg:min-w-0 max-lg:w-[calc(100vw-1rem)] max-lg:max-h-[70vh] max-lg:overflow-y-auto
          {small ? 'fixed left-2' : 'absolute left-0 top-[calc(100%+4px)]'}
          {openId === menu.id ? 'block' : 'hidden'}"
        style={small ? `top:${pos.top}px;` : ""}
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
