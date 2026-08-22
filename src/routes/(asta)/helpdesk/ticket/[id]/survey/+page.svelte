<script lang="ts">
  import { page } from "$app/state";
  import { submitTicketSurvey } from "$lib/remotes/helpdesk.remote";

  const id = page.params.id as string;

  let rating = $state(0);
  let ease = $state(0);
  let comment = $state("");
  let loading = $state(false);
  let done = $state(false);
  let errorMsg = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!rating || !ease || loading) return;
    loading = true;
    errorMsg = "";
    try {
      await submitTicketSurvey({
        ticketId: id,
        rating,
        ease,
        comment: comment || undefined,
      });
      done = true;
    } catch (err: any) {
      errorMsg = err?.message || "Gagal mengirim survey.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-xl mx-auto px-5 py-12">
  {#if done}
    <div class="text-center py-16">
      <div class="text-6xl mb-4 text-success">
        <iconify-icon icon="bx:heart"></iconify-icon>
      </div>
      <h1 class="text-2xl font-black mb-2">Terima Kasih!</h1>
      <p class="opacity-60 mb-6">
        Penilaian Anda membantu kami meningkatkan layanan.
      </p>
      <a href={`/helpdesk/ticket/${id}`} class="btn btn-primary"
        >Kembali ke Tiket</a
      >
    </div>
  {:else}
    <div class="breadcrumbs text-sm mb-4">
      <ul>
        <li><a href="/helpdesk">Helpdesk</a></li>
        <li><a href={`/helpdesk/ticket/${id}`}>Tiket</a></li>
        <li>Survey</li>
      </ul>
    </div>

    <h1 class="text-2xl font-black mb-1">Survey Kepuasan Layanan</h1>
    <p class="text-sm opacity-60 mb-8">
      Bagaimana pengalaman Anda terhadap layanan helpdesk ini?
    </p>

    <form
      onsubmit={submit}
      class="bg-base-100/50 border border-base-300 rounded-2xl p-6 space-y-6"
    >
      <div>
        <div class="font-semibold text-sm block mb-2">
          1. Seberapa puas Anda dengan hasil penyelesaian tiket?
        </div>
        <div class="rating rating-lg">
          <input type="radio" name="hd-rating" class="rating-hidden" />
          {#each [1, 2, 3, 4, 5] as n (n)}
            <input
              type="radio"
              name="hd-rating"
              class="mask mask-star-2 bg-warning"
              aria-label={`${n} bintang`}
              bind:group={rating}
              value={n}
            />
          {/each}
        </div>
      </div>

      <div>
        <div class="font-semibold text-sm block mb-2">
          2. Seberapa mudah proses pengajuannya?
        </div>
        <div class="flex flex-wrap gap-2">
          {#each [1, 2, 3, 4, 5] as n (n)}
            <button
              type="button"
              onclick={() => (ease = n)}
              class={`btn btn-sm ${ease === n ? "btn-primary" : "btn-outline"}`}
            >
              {n}
            </button>
          {/each}
        </div>
        <div class="flex justify-between text-xs opacity-50 mt-1 max-w-44">
          <span>Sulit</span>
          <span>Mudah</span>
        </div>
      </div>

      <div>
        <label class="font-semibold text-sm block mb-2" for="hd-comment">
          Komentar / Saran (opsional)
        </label>
        <textarea
          id="hd-comment"
          bind:value={comment}
          class="textarea textarea-bordered w-full min-h-24"
          placeholder="Tulis masukan Anda..."
        ></textarea>
      </div>

      {#if errorMsg}
        <div class="alert alert-error text-sm py-2">
          <iconify-icon icon="bx:error-circle"></iconify-icon>
          {errorMsg}
        </div>
      {/if}

      <button
        type="submit"
        class="btn btn-primary w-full"
        disabled={!rating || !ease || loading}
      >
        {#if loading}
          <span class="loading loading-spinner loading-sm"></span>
          Mengirim...
        {:else}
          Kirim Penilaian
        {/if}
      </button>
    </form>
  {/if}
</div>
