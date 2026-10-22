<script lang="ts">
  import "iconify-icon";
  import "../app.css";
  import { app } from "$lib/app/index.svelte";
  import { dev } from "$app/environment";
  import { updated } from "$app/state";
  import { onMount } from "svelte";

  let { children, data } = $props();

  // How often a tab that stays open asks the browser to look for a new
  // service worker.
  const UPDATE_CHECK_INTERVAL = 60_000;

  let updateDismissed = $state(false);

  onMount(async () => {
    app.theme = localStorage.theme || "light";
  });

  onMount(() => {
    if (dev || !("serviceWorker" in navigator)) return;

    // `updateViaCache: "none"` makes the browser re-fetch the worker script
    // instead of serving it from the HTTP cache, so a redeploy is noticed.
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // A worker is already waiting: it was installed while this page was
        // still running the previous release.
        if (registration.waiting && navigator.serviceWorker.controller) {
          app.updateAvailable = true;
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            // "installed" while an older worker is still in charge means the
            // page keeps running the old code until it is reloaded.
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              app.updateAvailable = true;
            }
          });
        });

        // A tab that stays open never navigates, so the browser has no
        // reason to look for a new worker on its own.
        setInterval(() => {
          if (document.visibilityState === "visible") registration.update();
        }, UPDATE_CHECK_INTERVAL);

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update();
        });
      })
      .catch(() => {});
  });

  // The server reports a different build than the one this page was loaded
  // with. This is the signal that also works when no service worker is
  // installed.
  $effect(() => {
    if (updated.current && !updateDismissed) app.updateAvailable = true;
  });

  $effect(() => {
    if (app.theme) {
      document.documentElement.dataset.theme = app.theme;
      localStorage.theme = app.theme;
    }
  });

  function reload() {
    app.updateAvailable = false;
    location.reload();
  }

  function dismissUpdate() {
    updateDismissed = true;
    app.updateAvailable = false;
  }
</script>

<svelte:head>
  <!-- Open Graph / WhatsApp -->
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="id_ID" />
  <meta property="og:url" content="/" />
  <meta
    property="og:title"
    content="Tapak Astà – Tata Pelayanan Keamanan & Sertifikat Elektronik"
  />
  <meta
    property="og:description"
    content="Platform digital Kota Mojokerto untuk pengajuan, penerbitan, dan pengelolaan sertifikat elektronik dengan tata pelayanan keamanan yang terpercaya dan mudah diakses."
  />
  <meta property="og:image" content="{data.baseURL}/logo.png" />
  <meta property="og:logo" content="{data.baseURL}/logo.png" />
  <meta property="og:image:alt" content="Logo Tapak Astà Kota Mojokerto" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta
    name="twitter:title"
    content="Tapak Astà – Sertifikat Elektronik Kota Mojokerto"
  />
  <meta
    name="twitter:description"
    content="Aplikasi resmi Kota Mojokerto untuk pengelolaan sertifikat elektronik yang aman dan terpercaya."
  />
  <meta name="twitter:image" content="{data.baseURL}/logo.png" />
</svelte:head>

{@render children()}

<div id="main-toast" class="toast toast-end toast-bottom z-9999">
  {#if app.updateAvailable}
    <div
      class="alert alert-info py-2 px-4 shadow-xl text-xs font-semibold flex-wrap gap-2"
      role="status"
    >
      <iconify-icon icon="bx:refresh"></iconify-icon>
      <span>Pembaruan tersedia. Muat ulang untuk memakai versi terbaru.</span>
      <button class="btn btn-xs btn-primary" onclick={reload}>Muat Ulang</button>
      <button
        class="btn btn-xs btn-ghost btn-circle"
        aria-label="Tutup"
        onclick={dismissUpdate}
      >
        <iconify-icon icon="bx:x"></iconify-icon>
      </button>
    </div>
  {/if}
  {#each app.toasts as toast (toast.id)}
    <div
      class="alert py-2 px-4 shadow-xl text-xs font-semibold {toast.type ===
      'success'
        ? 'alert-success'
        : toast.type === 'warning'
          ? 'alert-warning'
          : 'alert-error'}"
    >
      <iconify-icon
        icon={toast.type === "success"
          ? "bx:check-circle"
          : toast.type === "warning"
            ? "bx:warning"
            : "bx:error-circle"}
      ></iconify-icon>
      <span>{toast.message}</span>
    </div>
  {/each}
</div>
