<script lang="ts">
  import { workspace } from "$lib/app/sign-workspace.svelte";
</script>

<div
  class="menubar no-scrollbar flex items-center h-8 shrink-0 ml-0 lg:ml-5 max-lg:mb-1 max-lg:h-auto max-lg:flex-wrap max-lg:gap-y-1 relative z-[999]"
>
  {#each workspace.menus as menu (menu.id)}
    <!-- Anchors its own panel on small screens (see the style block). -->
    <div class="menubar-item dropdown dropdown-hover h-8 shrink-0 max-lg:static">
      <button
        type="button"
        tabindex="0"
        id={menu.id === "mode" ? "tour-mode" : undefined}
        class={menu.variant === "primary"
          ? `btn btn-sm btn-soft btn-primary rounded-full justify-between gap-0.5 [--btn-p:0.375rem] ${menu.width ?? ""}`
          : `h-full px-3 rounded-full text-xs text-base-content cursor-pointer border-0 hover:bg-base-200 bg-transparent`}
        aria-haspopup="true"
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

      <!-- daisyUI dropdown-hover content -->
      <ul
        class="menu-panel dropdown-content menu menu-sm p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-[9999]
          max-md:min-w-0 max-md:w-full max-md:left-0 max-md:right-0 max-md:max-h-[70vh] max-md:overflow-y-auto
          absolute left-0 top-full min-w-60"
        role="menu"
        tabindex="-1"
      >
        {#each menu.items as item, i (i)}
          {#if item === "sep"}
            <li class="menu-separator h-px my-1 bg-base-300"></li>
          {:else if "label" in item && !item.icon && !item.action && !item.href}
            <li class="menu-title px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase opacity-60">
              {item.label}
            </li>
          {:else if item.href}
            <li>
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

<style>
  /* Below lg the menubar stays on a single, sideways-scrolling row. Panels are
     lifted out of the scroller with position: fixed and anchored to their own
     button, so the row's overflow never clips them. Browsers without CSS anchor
     positioning keep the wrapped fallback defined by the utility classes. */
  @supports (anchor-name: --menubar-item) and (top: anchor(--menubar-item bottom)) {
    @media (max-width: 1023.98px) {
      .menubar {
        flex-wrap: nowrap;
        height: auto;
        overflow-x: auto;
        overflow-y: hidden;
      }

      .menubar-item {
        anchor-scope: --menubar-item;
      }

      .menubar-item > button {
        anchor-name: --menubar-item;
      }

      .menubar-item > .menu-panel {
        position: fixed;
        top: anchor(--menubar-item bottom);
        right: auto;
        bottom: auto;
        left: clamp(
          0.5rem,
          anchor(--menubar-item left),
          calc(100vw - min(15rem, 100vw - 1rem) - 0.5rem)
        );
        width: min(15rem, calc(100vw - 1rem));
        min-width: 0;
        max-height: calc(100dvh - anchor(--menubar-item bottom) - 1rem);
        overflow-y: auto;
        /* Flush with the button: a gap would drop :hover between them and close
           the panel before the pointer reaches it. */
        margin-block-start: 0;
      }
    }
  }
</style>
