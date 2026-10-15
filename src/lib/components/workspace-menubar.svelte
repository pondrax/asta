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

<div class="ws-menubar ml-0 md:ml-5">
  {#each workspace.menus as menu (menu.id)}
    <div
      class="ws-item"
      role="none"
      class:open={openId === menu.id}
      onmouseenter={() => (openId = menu.id)}
      onmouseleave={close}
    >
      <button
        type="button"
        class="ws-btn"
        aria-haspopup="true"
        aria-expanded={openId === menu.id}
        onclick={(e) => {
          e.stopPropagation();
          openId = openId === menu.id ? null : menu.id;
        }}
      >
        {menu.label}
      </button>
      <div class="ws-popup" role="menu" tabindex="-1">
        {#each menu.items as item, i (i)}
          {#if item === "sep"}
            <div class="ws-sep"></div>
          {:else if item.href}
            <a class="ws-menuitem" role="menuitem" href={item.href}>
              <span class="ws-icon">
                <iconify-icon icon={item.icon} width="18" height="18"
                ></iconify-icon>
              </span>
              {item.label}
              {#if item.badge}<span class="ws-badge">{item.badge}</span>{/if}
            </a>
          {:else}
            <button
              class="ws-menuitem"
              role="menuitem"
              disabled={item.disabled}
              onclick={() => {
                close();
                item.action?.();
              }}
            >
              <span class="ws-icon">
                <iconify-icon icon={item.icon} width="18" height="18"
                ></iconify-icon>
              </span>
              {item.label}
              {#if item.shortcut}<span class="ws-kbd">{item.shortcut}</span
                >{/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .ws-menubar {
    display: flex;
    align-items: center;
    height: 32px;
    flex: none;
  }
  .ws-item {
    position: relative;
    height: 100%;
  }
  .ws-btn {
    height: 100%;
    padding: 0 12px;
    border: 0;
    border-radius: 9999px;
    background: transparent;
    color: var(--color-base-content);
    font-size: 12px;
    cursor: pointer;
  }
  .ws-btn:hover,
  .ws-item.open .ws-btn {
    background: var(--color-base-200);
  }
  .ws-popup {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 240px;
    display: none;
    padding: 5px 0;
    background: var(--color-base-100);
    border: 1px solid var(--color-base-300);
    border-radius: 8px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
    z-index: 60;
  }
  /* Bridge the gap between the trigger and the popup so the pointer can
     travel down without the item losing hover. */
  .ws-popup::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 0;
    right: 0;
    height: 4px;
  }
  .ws-item.open .ws-popup {
    display: block;
  }
  .ws-menuitem {
    width: 100%;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    text-align: left;
    font-size: 13px;
    color: var(--color-base-content);
    text-decoration: none;
    cursor: pointer;
  }
  .ws-menuitem:hover {
    background: var(--color-base-200);
  }
  .ws-menuitem:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .ws-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 18px;
    height: 18px;
    opacity: 0.7;
  }
  .ws-kbd {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.5;
  }
  .ws-badge {
    margin-left: auto;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-primary-content);
  }
  .ws-sep {
    height: 1px;
    margin: 5px 0;
    background: var(--color-base-300);
  }
</style>
