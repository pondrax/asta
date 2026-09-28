<script lang="ts">
  import type { ConsentChoice } from "$lib/app/cookie-consent";
  import { setCookieConsent } from "$lib/remotes/consent.remote";

  /**
   * The decision made during SSR, passed down from the root layout's `load`.
   * Deciding server-side is what stops the banner flashing in after hydration
   * for a visitor who already answered.
   */
  let { consent = null }: { consent?: ConsentChoice | null } = $props();

  /**
   * The visitor's own click, held locally so the banner disappears the instant
   * the button is pressed rather than waiting for the cookie round trip. `null`
   * until they decide, in which case the server-rendered value governs.
   */
  let picked = $state<ConsentChoice | null>(null);
  let saving = $state(false);

  // `picked` is cleared if the write fails, which falls back to `consent` and
  // brings the banner back rather than hiding a decision that was never saved.
  let choice = $derived(picked ?? consent);

  async function decide(value: ConsentChoice) {
    picked = value;
    saving = true;
    try {
      await setCookieConsent(value);
    } catch {
      picked = null;
    } finally {
      saving = false;
    }
  }
</script>

{#if choice === null}
  <!--
    `z-1001`, not `z-40`: daisyUI pins `.fab` at z-index 999 and the editor
    raises one to z-1000. Those FABs are fixed to the same bottom edge, so at
    the default stacking this banner sat behind them. One notch above the
    highest FAB keeps the two from overlapping, while staying well under the
    toast stack (z-9999) so a toast is never obscured.
  -->
  <div class="fixed bottom-0 left-0 right-0 z-1001 p-4 pointer-events-none">
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
        <button
          class="btn btn-sm btn-ghost"
          disabled={saving}
          onclick={() => decide("rejected")}
        >
          Tolak
        </button>
        <button
          class="btn btn-sm btn-primary"
          disabled={saving}
          onclick={() => decide("accepted")}
        >
          Setuju
        </button>
      </div>
    </div>
  </div>
{/if}
