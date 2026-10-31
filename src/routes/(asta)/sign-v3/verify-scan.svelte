<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  let {
    onResult,
  }: { onResult: (value: string) => void } = $props();

  let video: HTMLVideoElement | null = $state(null);
  let error = $state("");
  let scanner: { start: () => Promise<void>; destroy: () => void } | null = null;

  onMount(async () => {
    if (!video) return;
    try {
      const QrScanner = (await import("qr-scanner")).default;
      scanner = new QrScanner(
        video,
        (result: { data: string }) => {
          if (result?.data) onResult(result.data);
        },
        { highlightScanRegion: true, highlightCodeOutline: true },
      );
      await scanner.start();
    } catch (err) {
      console.error("[verify] camera error", err);
      error = "Gagal mengakses kamera. Pastikan izin kamera telah diberikan.";
    }
  });

  onDestroy(() => {
    scanner?.destroy();
    scanner = null;
  });
</script>

<div class="flex flex-col gap-3 my-2">
  <video
    bind:this={video}
    class="w-full aspect-square rounded-xl bg-base-300 object-cover"
    playsinline
    muted
  ></video>
  {#if error}
    <div class="alert alert-error alert-sm">
      <span class="text-xs">{error}</span>
    </div>
  {:else}
    <p class="text-xs opacity-60 text-center">
      Arahkan kamera ke QR code pada dokumen.
    </p>
  {/if}
</div>
