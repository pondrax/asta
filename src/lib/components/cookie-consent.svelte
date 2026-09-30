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
  <div
    class="fixed bottom-0 left-0 right-0 z-1001 p-2 sm:p-4 pointer-events-none"
  >
    <!--
      Not daisyUI's `alert`: that class is a `grid-auto-flow: column`, so the
      icon, the paragraph and the buttons each got their own column. With the
      action group pinned `shrink-0`, a phone-width screen left the paragraph a
      sliver wide — one word per line — and the banner grew tall enough to cover
      the viewport. A flex row plus a floated action group keeps the two buttons
      in the paragraph's own flow instead.
    -->
    <div
      role="region"
      aria-label="Persetujuan cookie"
      class="pointer-events-auto max-w-3xl mx-auto shadow-lg rounded-box bg-info text-info-content p-3 sm:p-4 flex items-start gap-2 sm:gap-3"
    >
      <iconify-icon icon="bx:cookie" class="text-xl shrink-0 mt-0.5"
      ></iconify-icon>
      <div class="text-sm flex-1 min-w-0">
        <p class="font-semibold">Kami menggunakan cookie</p>
        <!--
          The actions come first in the DOM because a float only rises to the top
          of the block it precedes. Below `sm` they float right and the paragraph
          wraps around them. From `sm` up the float is dropped and the row becomes
          a flex line, so the DOM order still has to be corrected with `order`:
          `sm:order-first` on the paragraph puts the text back on the left and
          leaves the actions on the right edge, as they were before.
        -->
        <div class="sm:flex sm:items-start sm:gap-3">
          <div
            class="float-right ml-2 mb-1 flex items-center gap-2 sm:float-none sm:ml-0 sm:mb-0 sm:order-last sm:shrink-0 sm:self-center"
          >
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
          <p class="text-base-content/70 sm:order-first sm:flex-1">
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
      </div>
    </div>
  </div>
{/if}
