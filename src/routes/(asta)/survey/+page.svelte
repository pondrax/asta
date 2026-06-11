<script lang="ts">
  import { page } from "$app/state";
  import { submitSurvey } from "$lib/remotes/survey.remote";

  let rating = $state(0);
  let feedback = $state("");
  let submitted = $state(false);
  let loading = $state(false);

  const email = $derived.by(() => {
    try {
      return atob(page.url.searchParams.get("email") || "");
    } catch {
      return "";
    }
  });

  async function submit() {
    if (!rating || loading) return;
    loading = true;
    try {
      await submitSurvey({ email, rating, feedback });
      submitted = true;
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-2xl mx-auto px-6 py-12">
  {#if submitted}
    <div class="text-center py-20">
      <div class="text-6xl mb-4">
        <iconify-icon icon="bx:heart" class="text-primary"></iconify-icon>
      </div>
      <h1 class="text-3xl font-black mb-2">Terima Kasih!</h1>
      <p class="opacity-60">Masukan Anda sangat berharga bagi kami.</p>
      <a href="/" class="btn btn-primary mt-6">Kembali ke Beranda</a>
    </div>
  {:else}
    <h1 class="text-3xl font-black mb-2">Survey Kepuasan</h1>
    <p class="text-sm opacity-60 mb-8">
      Bantu kami meningkatkan kualitas layanan Tapak Astà.
    </p>

    <div
      class="bg-base-100/50 p-6 rounded-2xl border border-base-300 space-y-6"
    >
      <div>
        <label class="font-semibold text-sm" for="survey-rating"
          >Seberapa puas Anda dengan layanan kami?</label
        >
        <div class="rating rating-lg mt-2">
          <input
            id="survey-rating"
            type="radio"
            name="survey-standalone"
            class="rating-hidden"
          />
          {#each [1, 2, 3, 4, 5] as n}
            <input
              type="radio"
              name="survey-standalone"
              class="mask mask-star-2 bg-warning"
              aria-label="{n} star"
              checked={rating === n}
              onchange={() => (rating = n)}
            />
          {/each}
        </div>
      </div>

      <div>
        <label class="font-semibold text-sm" for="feedback"
          >Kritik & Saran</label
        >
        <textarea
          id="feedback"
          class="textarea textarea-bordered w-full mt-2"
          rows="4"
          placeholder="Tulis masukan Anda di sini..."
          bind:value={feedback}
        ></textarea>
      </div>

      <button
        class="btn btn-primary w-full"
        onclick={submit}
        disabled={!rating || loading}
      >
        {#if loading}
          <span class="loading loading-spinner"></span>
        {:else}
          Kirim Survey
        {/if}
      </button>
    </div>
  {/if}
</div>
