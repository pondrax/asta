<script lang="ts">
  /** localStorage key holding the visitor's choice. Absent = not decided yet. */
  const STORAGE_KEY = "asta-cookie-consent";

  /**
   * `consent` is `null` until the stored choice has been read. `ready` stays
   * false during SSR and until the read happens, so the banner is never part
   * of the server-rendered HTML — otherwise a returning visitor who already
   * decided would see it flash in before hydration removes it.
   */
  let consent = $state<"accepted" | "rejected" | null>(null);
  let ready = $state(false);

  $effect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "accepted" || stored === "rejected") consent = stored;
    else consent = null;
    ready = true;
  });

  function decide(choice: "accepted" | "rejected") {
    localStorage.setItem(STORAGE_KEY, choice);
    consent = choice;
  }
</script>

{#if ready && consent === null}
  <!-- No intro transition: the banner is revealed by the localStorage read
       right after mount, and an intro that never runs would leave it stuck at
       opacity 0 — invisible and below the fold. -->
  <div class="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
    <div
      role="region"
      aria-label="Persetujuan cookie"
      class="alert alert-info pointer-events-auto max-w-3xl mx-auto shadow-lg items-start"
    >
      <iconify-icon icon="bx:cookie" class="text-xl shrink-0 mt-0.5"
      ></iconify-icon>
      <!-- `flex-1` absorbs the leftover width so the action group is pushed to
           the alert's right edge instead of trailing the text. -->
      <div class="text-sm flex-1">
        <p class="font-semibold">Kami menggunakan cookie</p>
        <p class="text-base-content/70">
          Situs ini menggunakan cookie untuk menyimpan preferensi, sesi, dan
          statistik kunjungan. Anda dapat menolak tanpa kehilangan akses ke
          fitur utama. Rinciannya ada di
          <a
            href="/pages/privacy-policy"
            class="link link-hover underline underline-offset-2"
          >
            Kebijakan Privasi
          </a>
          dan
          <a
            href="/pages/terms-of-use"
            class="link link-hover underline underline-offset-2"
          >
            Ketentuan Penggunaan
          </a>.
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button class="btn btn-sm btn-ghost" onclick={() => decide("rejected")}>
          Tolak
        </button>
        <button
          class="btn btn-sm btn-primary"
          onclick={() => decide("accepted")}
        >
          Setuju
        </button>
      </div>
    </div>
  </div>
{/if}
