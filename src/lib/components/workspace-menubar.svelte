<script lang="ts">
  import { onMount } from "svelte";
  import { workspace } from "$lib/app/sign-workspace.svelte";

  let openId = $state<string | null>(null);
  let small = $state(false);
  let pos = $state({ top: 48 });

  function close() {
    openId = null;
  }

  function toggle(menuId: string, el: HTMLElement) {
    if (openId === menuId) {
      openId = null;
    } else {
      openId = menuId;
      const rect = el.getBoundingClientRect();
      pos = { top: rect.bottom + 4 };
    }
  }

  onMount(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const update = () => (small = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  });
</script>

<svelte:window
  onclick={(e) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.(".dropdown")) close();
  }}
  onkeydown={(e) => {
    if (e.key === "Escape") close();
  }}
/>

<div
  class="no-scrollbar flex items-center h-8 shrink-0 ml-0 md:ml-5 max-md:mb-1 max-md:overflow-x-auto max-md:overflow-y-hidden"
>
  {#each workspace.menus as menu (menu.id)}
    <div
      class="dropdown h-full shrink-0 {openId === menu.id ? 'dropdown-open' : ''}"
      onmouseenter={(e) => {
        if (small) return;
        openId = menu.id;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        pos = { top: rect.bottom + 4 };
      }}
      onmouseleave={() => {
        if (small) return;
        close();
      }}
    >
      <button
        type="button"
        tabindex="0"
        id={menu.id === "mode" ? "tour-mode" : undefined}
        class={menu.variant === "primary"
          ? `btn btn-sm btn-soft btn-primary rounded-full justify-between gap-0.5 [--btn-p:0.375rem] ${menu.width ?? ""}`
          : `h-full px-3 rounded-full text-xs text-base-content cursor-pointer border-0 ${openId === menu.id ? "bg-base-200" : "bg-transparent hover:bg-base-200"}`}
        aria-haspopup="true"
        aria-expanded={openId === menu.id}
        onclick={(e) => {
          e.stopPropagation();
          toggle(menu.id, e.currentTarget as HTMLElement);
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

      <!-- dropdown-content menu using daisyUI semantics -->
      <ul
        class="dropdown-content menu menu-sm p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-[70]
          before:content-[''] before:absolute before:-top-1 before:left-0 before:right-0 before:h-1
          max-md:min-w-0 max-md:w-[calc(100vw-1rem)] max-md:max-h-[70vh] max-md:overflow-y-auto
          {small ? 'fixed left-2' : 'absolute left-0 top-[calc(100%+4px)] min-w-60'}
          {openId === menu.id ? 'block' : 'hidden'}"
        style={small ? `top:${pos.top}px;` : ""}
        role="menu"
        tabindex="-1"
      >
        {#each menu.items as item, i (i)}
          {#if item === "sep"}
            <li class="menu-separator h-px my-1 bg-base-300"></li>
          {:else if item.href}
            <li>
              <a
                class="flex items-center gap-2.5 w-full min-h-8 px-3 text-[13px] text-base-content no-underline cursor-pointer hover:bg-base-200"
                role="menuitem"
                href={item.href}
                onclick={() => close()}
              >
                <span
                  class="flex size-4 shrink-0 items-center justify-center text-[16px] leading-none opacity-70"
                >
                  <iconify-icon icon={item.icon}></iconify-icon>
                </span>
                <span class="text-[13px] leading-none">{item.label}</span>
                {#if item.badge}
                  <span
                    class="badge badge-sm badge-primary ml-auto text-[10px]"
                    >{item.badge}</span
                  >
                {/if}
              </a>
            </li>
          {:else}
            <li>
              <button
                type="button"
                class="flex items-center gap-2.5 w-full min-h-8 px-3 text-left text-[13px] text-base-content cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default"
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
            </li>
          {/if}
        {/each}
      </ul>
    </div>
  {/each}
</div>
