<script lang="ts">
  /**
   * Per-page changelog popup.
   *
   * Opened from the navbar clock. Shows the entries scoped to the page the user
   * is on (longest-prefix match), with a tab to see every page's updates.
   * Read/unread state lives in the shared `changelogSeen` store so the navbar
   * "new" dot and this list can never disagree.
   */
  import {
    AUDIENCE_INFO,
    CHANGE_STYLES,
    audienceForRole,
    canViewerSee,
    changelogSeen,
    getAllEntries,
    getChangelogFor,
    loadChangelogSeen,
    markChangelogSeen,
    markChangelogSeenMany,
  } from "$lib/app/changelog.svelte";
  import { d } from "$lib/utils";

  let {
    pathname = "/",
    role = null,
    open = $bindable(false),
  }: {
    pathname?: string;
    role?: string | null;
    open?: boolean;
  } = $props();

  let scope = $state<"page" | "all">("page");
  let dialogEl = $state<HTMLDialogElement | undefined>(undefined);

  const pageChangelog = $derived(getChangelogFor(pathname));

  /**
   * What the viewer can actually reach. Entries above this tier are hidden
   * rather than shown-and-locked, so a member never sees admin-only notes for
   * a page that would 403 for them anyway.
   */
  const tier = $derived(audienceForRole(role));

  const entries = $derived(
    (scope === "page"
      ? pageChangelog.entries.map((e) => ({
          page: pageChangelog.page,
          entry: e,
        }))
      : getAllEntries()
    ).filter(({ entry }) => canViewerSee(entry, tier)),
  );

  /** Unseen entries in the current scope — drives the "Tandai dibaca" count. */
  const unseenCount = $derived(
    entries.filter(({ entry }) => !changelogSeen.ids.includes(entry.id)).length,
  );

  function formatDate(date: string) {
    try {
      return d(date).format("D MMMM YYYY");
    } catch {
      return date;
    }
  }

  // Re-read persisted state on open so a popup shown in a fresh tab is accurate.
  $effect(() => {
    if (open) loadChangelogSeen();
  });

  // Keep the <dialog> in sync with the bindable `open` prop.
  $effect(() => {
    const el = dialogEl;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  });
</script>

{#if open}
  <dialog
    bind:this={dialogEl}
    class="modal modal-open"
    onclose={() => (open = false)}
  >
    <div
      class="modal-box max-w-2xl bg-base-100 border border-base-content/10 shadow-2xl rounded-2xl flex flex-col max-h-[85vh]"
    >
      <div
        class="flex items-start justify-between border-b border-base-content/10 pb-3 mb-3 gap-2"
      >
        <div class="min-w-0">
          <h3 class="font-bold text-lg flex items-center gap-2">
            <iconify-icon icon="bx:time" class="text-xl"></iconify-icon>
            Apa yang Baru
          </h3>
          {#if scope === "page"}
            <p class="text-xs opacity-60 mt-0.5">
              Pembaruan untuk halaman {pageChangelog.page}
            </p>
          {:else}
            <p class="text-xs opacity-60 mt-0.5">
              Pembaruan dari seluruh halaman
            </p>
          {/if}
        </div>
        <button
          class="btn btn-ghost btn-circle btn-sm shrink-0"
          aria-label="Tutup"
          onclick={() => (open = false)}
        >
          ✕
        </button>
      </div>

      <div class="flex items-center justify-between gap-2 mb-3">
        <div role="tablist" class="tabs tabs-box tabs-xs">
          <button
            role="tab"
            class="tab {scope === 'page' ? 'tab-active' : ''}"
            onclick={() => (scope = "page")}
          >
            Halaman ini
          </button>
          <button
            role="tab"
            class="tab {scope === 'all' ? 'tab-active' : ''}"
            onclick={() => (scope = "all")}
          >
            Semua
          </button>
        </div>
        {#if unseenCount > 0}
          <button
            class="btn btn-ghost btn-xs gap-1"
            onclick={() =>
              markChangelogSeenMany(entries.map((e) => e.entry.id))}
          >
            <iconify-icon icon="bx:check-double"></iconify-icon>
            Tandai dibaca ({unseenCount})
          </button>
        {/if}
      </div>

      <div class="flex-1 overflow-y-auto -mx-1 px-1">
        {#if !entries.length}
          <div
            class="text-center py-10 text-xs opacity-50 border border-dashed border-base-content/15 rounded-lg"
          >
            Belum ada pembaruan untuk halaman ini.
          </div>
        {:else}
          <div class="space-y-3">
            {#each entries as { page, entry } (entry.id)}
              {@const isNew = !changelogSeen.ids.includes(entry.id)}
              {@const audience = AUDIENCE_INFO[entry.audience ?? "guest"]}
              <article
                class="border border-base-content/10 rounded-xl p-3 {isNew
                  ? 'bg-base-200/60'
                  : 'bg-base-100'}"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h4 class="font-semibold text-sm">{entry.title}</h4>
                      {#if entry.version}
                        <span class="badge badge-ghost badge-xs"
                          >{entry.version}</span
                        >
                      {/if}
                      {#if isNew}
                        <span class="badge badge-primary badge-xs">Baru</span>
                      {/if}
                    </div>
                    <p
                      class="text-[11px] opacity-60 mt-0.5"
                      title={audience.hint}
                    >
                      {formatDate(entry.date)}
                      {#if scope === "all" && page !== pageChangelog.page}
                        · {page}
                      {/if}
                      · {audience.label}
                    </p>
                  </div>
                  {#if isNew}
                    <button
                      class="btn btn-ghost btn-circle btn-xs shrink-0"
                      aria-label="Tandai sudah dibaca"
                      data-tip="Tandai dibaca"
                      onclick={() => markChangelogSeen(entry.id)}
                    >
                      <iconify-icon icon="bx:check" class="text-base"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>

                <ul class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5">
                  {#each entry.changes as change, i (i)}
                    {@const style = CHANGE_STYLES[change.kind]}
                    <li
                      class="col-span-2 grid grid-cols-subgrid items-start text-xs"
                    >
                      <span
                        class="badge badge-xs {style.class} w-full justify-center whitespace-nowrap"
                      >
                        {style.label}
                      </span>
                      <span class="opacity-80 leading-relaxed"
                        >{change.text}</span
                      >
                    </li>
                  {/each}
                </ul>
              </article>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-action mt-3 pt-3 border-t border-base-content/10">
        <button class="btn btn-neutral btn-sm" onclick={() => (open = false)}
          >Tutup</button
        >
      </div>
    </div>
    <div
      class="modal-backdrop bg-black/40 backdrop-blur-xs"
      role="button"
      tabindex="0"
      onclick={() => (open = false)}
      onkeydown={(e) => e.key === "Enter" && (open = false)}
    ></div>
  </dialog>
{/if}
