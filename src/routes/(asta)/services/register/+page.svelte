<script lang="ts">
  import { checkUser, verifyTurnstile } from "$lib/remotes/sign.remote";
  import Lottie from "$lib/components/lottie.svelte";
  import { fade, slide } from "svelte/transition";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";

  let identifier = $state(page.url.searchParams.get("identity") || "");
  let checking = $state(false);
  let statusResult = $state<any>(null);
  let turnstileSuccess = $state(false);
  let turnstileId = $state("");
  let errorMessage = $state("");
  let isInitialAutoCheck = $state(!!page.url.searchParams.get("identity"));

  async function handleCheck() {
    if (!identifier) return;
    if (!turnstileSuccess) {
      errorMessage = "Harap selesaikan verifikasi keamanan.";
      return;
    }

    isInitialAutoCheck = false;
    errorMessage = "";
    checking = true;
    try {
      // Determine if identifier is email or NIK
      const isEmail = identifier.includes("@");
      statusResult = await checkUser(
        isEmail ? { email: identifier } : { nik: identifier },
      );
    } catch (e) {
      console.error(e);
      statusResult = { error: "Terjadi kesalahan saat mengecek status." };
    } finally {
      checking = false;
      // @ts-expect-error
      window.turnstile.reset(turnstileId);
      turnstileSuccess = false;
    }
  }

  const requirements = [
    {
      id: 1,
      title: "Email Dinas Aktif",
      desc: "Memiliki email @mojokertokota.go.id yang aktif dan dapat diakses.",
      icon: "bx:envelope",
    },
    {
      id: 2,
      title: "Pegawai Aktif",
      desc: "Status sebagai pegawai aktif (ASN atau Non ASN) di lingkungan Pemerintah Kota Mojokerto.",
      icon: "bx:user-check",
    },
  ];

  const steps = [
    {
      id: "step-1",
      title: "Isi Pengajuan",
      desc: "Isi link formulir pengajuan email dinas.",
      link: "/sign?template=pengajuan-email",
      linkText: "Form Pengajuan",
    },
    {
      id: "step-2",
      title: "Terima Notifikasi",
      desc: "Notifikasi akses akan dikirim melalui WhatsApp.",
      icon: "bx:message-rounded-dots",
    },
    {
      id: "step-3",
      title: "Aktivasi",
      desc: "Cek inbox email untuk petunjuk registrasi akun BSRE.",
      icon: "bx:mail-send",
    },
    {
      id: "step-4",
      title: "Sertifikat Elektronik",
      desc: "Ikuti petunjuk di email untuk aktivasi sertifikat.",
      icon: "bx:certification",
    },
  ];
  onMount(() => {
    // Initialize Turnstile
    // @ts-expect-error
    turnstileId = window.turnstile.render("#turnstile-container", {
      sitekey: env.PUBLIC_TURNSTILE_KEY,
      size: "flexible",
      callback: async function (token: string) {
        const verify = await verifyTurnstile({ __token: token });
        if (verify.success) {
          turnstileSuccess = true;
          errorMessage = "";
          // Only auto-trigger if we are in the initial phase and have an identifier
          if (isInitialAutoCheck && identifier) {
            handleCheck();
          }
        }
      },
    });
  });
</script>

<svelte:head>
  <title>Registrasi Akun BSRE - Tapak Astà</title>
</svelte:head>

<div class="min-h-screen pb-20 px-4">
  <div class="max-w-5xl mx-auto">
    <!-- Hero Section -->
    <section class="py-12 text-center" in:fade>
      <div class="w-32 h-32 mx-auto drop-shadow-2xl">
        <Lottie url="/asta-themed.json" loop autoplay />
      </div>
      <h1
        class="text-3xl md:text-4xl font-black bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent mb-4"
      >
        Registrasi Akun BSRE
      </h1>
      <p class="text-lg text-base-content/60 max-w-2xl mx-auto">
        Layanan pendaftaran sertifikat elektronik bagi pegawai di lingkungan
        Pemerintah Kota Mojokerto.
      </p>
    </section>

    <div class="grid lg:grid-cols-12 gap-8 items-start">
      <!-- Left Column: Checker & Info -->
      <div class="lg:col-span-7 space-y-8">
        <!-- Requirements -->
        <div
          class="card bg-base-100/50 backdrop-blur-xl border border-base-200 shadow-xl overflow-hidden"
          in:slide={{ delay: 200 }}
        >
          <div class="card-body">
            <h2 class="text-xl font-bold flex items-center gap-2 mb-4">
              <iconify-icon
                icon="bx:shield-quarter"
                class="text-primary text-2xl"
              ></iconify-icon>
              Prasyarat Pendaftaran
            </h2>
            <div class="grid sm:grid-cols-2 gap-4">
              {#each requirements as req (req.id)}
                <div
                  class="p-4 rounded-2xl bg-base-200/50 border border-base-300 transition-all hover:border-primary/30"
                >
                  <iconify-icon
                    icon={req.icon}
                    class="text-3xl text-primary mb-2"
                  ></iconify-icon>
                  <h3 class="font-bold text-sm uppercase tracking-wider">
                    {req.title}
                  </h3>
                  <p class="text-xs text-base-content/70 mt-1 leading-relaxed">
                    {req.desc}
                  </p>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Checker -->
        <div
          class="card bg-base-100 shadow-2xl border border-primary/10"
          in:slide={{ delay: 400 }}
        >
          <div class="card-body">
            <h2 class="text-xl font-bold flex items-center gap-2 mb-4">
              <iconify-icon icon="bx:search-alt" class="text-secondary text-2xl"
              ></iconify-icon>
              Cek Status Sertifikat
            </h2>
            <div class="space-y-4">
              <div class="form-control w-full">
                <div class="label">
                  <span class="label-text">Email Dinas atau NIK</span>
                </div>
                <label
                  class="input input-bordered flex items-center gap-2 shadow-inner"
                >
                  <iconify-icon icon="bx:user-pin" class="opacity-50 text-xl"
                  ></iconify-icon>
                  <input
                    type="text"
                    class="grow"
                    placeholder="nama@mojokertokota.go.id atau NIK 16 digit"
                    bind:value={identifier}
                    oninput={() => (isInitialAutoCheck = false)}
                    onkeydown={(e) => e.key === "Enter" && handleCheck()}
                  />
                </label>
                <div class="label">
                  <span class="label-text-alt opacity-50 italic"
                    >Masukkan salah satu untuk pengecekan status</span
                  >
                </div>
              </div>

              <div id="turnstile-container" class="flex w-full"></div>

              {#if errorMessage}
                <div
                  class="text-error text-xs text-center mb-2"
                  transition:slide
                >
                  {errorMessage}
                </div>
              {/if}

              <button
                class="btn btn-primary w-full shadow-lg shadow-primary/20"
                onclick={handleCheck}
                disabled={checking || !identifier}
              >
                {#if checking}
                  <span class="loading loading-spinner"></span>
                {/if}
                Periksa Status Akun
              </button>
            </div>

            {#if statusResult}
              <div
                class="mt-6 p-5 rounded-2xl bg-secondary/5 border border-secondary/20 animate-in fade-in zoom-in-95 duration-300"
              >
                <div class="flex items-start gap-4">
                  <div
                    class="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center shrink-0"
                  >
                    <iconify-icon
                      icon="bx:info-circle"
                      class="text-secondary text-2xl"
                    ></iconify-icon>
                  </div>
                  <div class="grow">
                    <h3 class="font-bold text-secondary">Hasil Pemeriksaan</h3>
                    <p class="text-sm mt-1 leading-relaxed">
                      {statusResult.message ||
                        statusResult.status ||
                        "Status tidak diketahui atau data belum terdaftar."}
                    </p>
                    {#if statusResult.status === "NOT_REGISTERED"}
                      <p class="text-xs mt-3 opacity-60 italic">
                        *Jika data Anda sudah benar namun belum terdaftar,
                        silakan lanjutkan ke alur pengajuan.
                      </p>
                    {/if}
                  </div>
                  <button
                    class="btn btn-ghost btn-xs btn-circle"
                    onclick={() => (statusResult = null)}
                    aria-label="Tutup hasil pemeriksaan"
                  >
                    <iconify-icon icon="bx:x"></iconify-icon>
                  </button>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Right Column: Flow & Action -->
      <div class="lg:col-span-5 space-y-8">
        <!-- Flow -->
        <div
          class="card bg-neutral text-neutral-content shadow-xl"
          in:slide={{ delay: 600 }}
        >
          <div class="card-body">
            <h2 class="text-xl font-bold flex items-center gap-2 mb-6">
              <iconify-icon
                icon="bx:git-repo-forked"
                class="text-accent text-2xl"
              ></iconify-icon>
              Alur Registrasi
            </h2>

            <div class="space-y-6">
              {#each steps as step (step.id)}
                <div class="flex gap-4 group">
                  <div class="relative">
                    <div
                      class="w-8 h-8 rounded-full bg-accent text-accent-content flex items-center justify-center font-bold text-sm z-10 relative"
                    >
                      {steps.indexOf(step) + 1}
                    </div>
                    {#if steps.indexOf(step) < steps.length - 1}
                      <div
                        class="absolute top-8 left-4 w-px h-10 bg-accent/30 -translate-x-1/2"
                      ></div>
                    {/if}
                  </div>
                  <div class="flex-1">
                    <h4
                      class="font-bold text-base leading-tight group-hover:text-accent transition-colors"
                    >
                      {step.title}
                    </h4>
                    <p class="text-xs opacity-70 mt-1 leading-relaxed">
                      {step.desc}
                    </p>
                    {#if step.link}
                      <a
                        href={step.link}
                        class="btn btn-link btn-xs p-0 h-auto text-accent no-underline mt-2 flex items-center gap-1"
                      >
                        {step.linkText}
                        <iconify-icon icon="bx:right-arrow-alt"></iconify-icon>
                      </a>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <div class="divider before:bg-accent/20 after:bg-accent/20 mt-8">
              Tindakan
            </div>

            <div class="space-y-3">
              <a
                href="/sign?template=pengajuan-email"
                class="btn btn-accent w-full group"
              >
                <iconify-icon
                  icon="bx:edit-alt"
                  class="group-hover:rotate-12 transition-transform"
                ></iconify-icon>
                Form Pengajuan Email Dinas
              </a>
              <p class="text-[10px] text-center opacity-50 px-4">
                Gunakan jika Anda belum memiliki email @mojokertokota.go.id atau
                lupa akses login.
              </p>
            </div>
          </div>
        </div>

        <!-- User Agreement Card -->
        <div
          class="card bg-success/10 border border-success/20 shadow-md"
          in:slide={{ delay: 800 }}
        >
          <div class="card-body">
            <h3 class="font-bold flex items-center gap-2">
              <iconify-icon icon="bx:check-double" class="text-success"
              ></iconify-icon>
              Pasca Registrasi
            </h3>
            <p class="text-xs text-base-content/60 leading-relaxed">
              Setelah berhasil registrasi, Anda wajib mengisi formulir
              persetujuan pengguna.
            </p>
            <a
              href="/sign?template=persetujuan-pengguna"
              class="btn btn-outline btn-sm mt-2 w-full"
            >
              Isi Formulir Persetujuan
            </a>
          </div>
        </div>
      </div>
    </div>

    <div class="card mt-10">
      <h3 class="">
        Panduan Pendaftaran Sertifikat Elektronik by Pondra Setiawan
      </h3>

      <!-- Guide-->
      <div
        style="position: relative; width: 100%; height: 0; padding-top: 56.2500%;
 padding-bottom: 0; box-shadow: 0 2px 8px 0 rgba(63,69,81,0.16); margin-top: 1.6em; margin-bottom: 0.9em; overflow: hidden;
 border-radius: 8px; will-change: transform;"
      >
        <iframe
          loading="lazy"
          style="position: absolute; width: 100%; height: 100%; top: 0; left: 0; border: none; padding: 0;margin: 0;"
          src="https://www.canva.com/design/DAG35HAO4fM/qXm9Dvj4EtR7oarKPkTKqQ/view?embed"
          allowfullscreen
          allow="fullscreen"
          title="implementasi sertifikat elektronik"
        >
        </iframe>
      </div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    overflow-x: hidden;
  }
</style>
