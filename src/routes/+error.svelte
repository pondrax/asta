<script lang="ts">
  import { page } from "$app/state";
</script>

<svelte:head>
  <title>Oh No! | {page.status}</title>
</svelte:head>

<div
  class="min-h-screen grid place-items-center bg-white font-sans text-base-content p-6 overflow-hidden relative selection:bg-rose-100"
>
  <!-- Main Content -->
  <main
    class="flex flex-col md:flex-row items-center justify-center gap-16 max-w-7xl mx-auto w-full py-16 relative z-100"
  >
    <!-- Robot Side -->
    <div
      class="w-full md:w-1/2 flex flex-col items-center justify-center relative"
    >
      <!-- Inner Glow -->
      <div
        class="absolute w-[400px] h-[400px] rounded-full bg-[#ff3f34]/5 blur-[100px] pointer-events-none"
      ></div>

      <div
        class="relative w-80 h-80 md:w-[500px] md:h-[500px] flex items-center justify-center"
      >
        <!-- Floating Oops! Bubble -->
        <div
          class="absolute -top-16 -right-10 bg-white border-4 border-accent rounded-[2.5rem] p-10 shadow-[15px_15px_0_0_rgba(0,0,0,0.05)] z-[120]"
        >
          <div class="text-center">
            <h3
              class="text-6xl font-black text-base-content mb-1 leading-none tracking-tighter"
            >
              Oops!
            </h3>
            <p
              class="text-sm font-bold text-base-content-content/60 mt-2 uppercase tracking-widest"
            >
              {page.status} Error
            </p>
          </div>
        </div>

        <!-- Robot Body -->
        <div class="relative z-[110] flex flex-col items-center">
          <div
            class="absolute -top-24 left-1/2 -translate-x-1/2 w-20 h-20 border-8 border-accent rounded-3xl -rotate-12 shadow-xl animate-bounce duration-[4s]"
          >
            <div
              class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-4 border-accent flex items-center justify-center bg-accent/10"
            >
              <div class="w-2 h-2 bg-accent rounded-full"></div>
            </div>
          </div>

          <div
            class="w-72 h-80 rounded-[4rem] bg-white border-8 border-accent shadow-[24px_24px_0_0_rgba(0,0,0,0.05)] relative flex flex-col items-center justify-center p-0 group overflow-hidden"
          >
            <!-- <div
              class="w-full h-1/2 bg-accent/90 rounded-2xl border-4 border-accent/50 flex items-center justify-center overflow-hidden relative"
            >
              <iconify-icon
                icon="bx:cog"
                class="text-amber-500/20 text-8xl absolute animate-spin duration-[15s]"
              ></iconify-icon>
              <div
                class="text-white font-mono text-center relative z-10 leading-none"
              >
                <p
                  class="text-[10px] opacity-40 uppercase tracking-widest mb-2 font-bold"
                >
                  Internal_Err
                </p> -->
            <img src="/robot.gif" alt="robot" />
            <!-- </div>
            </div> -->
            <div class="w-full flex justify-between items-center px-10 py-2">
              <div class="flex gap-3">
                <div
                  class="w-6 h-6 rounded-full bg-accent flex items-center justify-center border-2 border-accent/50"
                >
                  <div
                    class="w-2 h-2 bg-rose-500 rounded-full animate-ping"
                  ></div>
                </div>
                <div
                  class="w-6 h-6 rounded-full bg-accent border-2 border-accent/50"
                ></div>
              </div>
              <div
                class="w-20 h-6 bg-accent/90 rounded-full border-4 border-accent/50 relative grow ml-6 overflow-hidden"
              >
                <div
                  class="absolute inset-y-0 left-0 w-[65%] bg-white/20"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Content Side -->
    <div class="w-full md:w-1/2 text-center md:text-left flex flex-col gap-10">
      <div>
        <h1
          class="text-7xl font-black leading-none text-base-content tracking-tighter drop-shadow-sm"
        >
          <span class="text-error">Oh No!</span>
        </h1>
        <div class="h-4 w-48 bg-accent/5 rounded-full mt-2"></div>
      </div>

      <p
        class="text-2xl md:text-4xl text-base-content/80 max-w-xl leading-tight font-bold tracking-tight"
      >
        {#if page.status === 404}
          Maybe Robot has broken this page.
          <br />
          Try again later.
        {:else if page.status === 403}
          Access Restricted.
          <br />
          This section is strictly for authorized admins only.
        {:else}
          Critical failure detected.
          <br />
          Our repair bots are on the way.
        {/if}
      </p>

      <div class="flex flex-col sm:flex-row gap-8 mt-6">
        <!-- Custom Button without DaisyUI Class dependency -->
        <a href="/" class="btn btn-accent">
          <iconify-icon icon="bx:arrow-back"></iconify-icon>
          Back to Homepage
        </a>
        <!-- <span
          class="text-base-content-content/60 font-black hover:text-[#ff3f34] transition-colors flex items-center justify-center gap-3 text-xl uppercase tracking-[0.1em] cursor-pointer"
        >
          Visit help center
          <iconify-icon icon="bx:right-arrow-alt" class="text-4xl"
          ></iconify-icon>
        </span> -->
      </div>
    </div>
  </main>
</div>

<style>
  :global(body) {
    background-color: white !important;
    margin: 0;
    overflow-x: hidden;
  }
</style>
