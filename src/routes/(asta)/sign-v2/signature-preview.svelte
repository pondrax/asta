<script lang="ts">
  import { generateQRCode } from "$lib/utils";

  let { form = {}, onChange } = $props();

  let canvasQR = $state() as HTMLCanvasElement;
  let canvasBox = $state() as HTMLCanvasElement;
  let ctxQR = $state() as CanvasRenderingContext2D;
  let ctxBox = $state() as CanvasRenderingContext2D;
  let logo = $state() as HTMLImageElement;
  let specimenDialog = $state<HTMLDialogElement>();

  const specimenKeys = ["jabatan", "instansi", "nama"];
  const defaultSpecimen = "jabatan\ninstansi\n\nnama";

  const resolveSpecimen = (tpl: string) =>
    tpl
      .split("\n")
      .map((line) => {
        const key = line.trim();
        return key in form ? (form[key] ?? "") : line;
      })
      .join("\n")
      .replace(/^\n+|\n+$/g, "");

  const reverseSpecimen = (value: string) =>
    value
      .split("\n")
      .map((line) =>
        line.trim() === ""
          ? line
          : (specimenKeys.find((k) => form[k] === line) ?? line),
      )
      .join("\n");

  const initCanvas = () => {
    if (!canvasQR || !canvasBox) return;
    ctxQR = canvasQR.getContext("2d")!;
    ctxBox = canvasBox.getContext("2d")!;
    ctxBox.font = "20px Arial";
  };

  const drawBox = () => {
    if (!ctxBox) return;
    ctxBox.fillStyle = "#fff";
    ctxBox.fillRect(0, 0, canvasBox.width, canvasBox.height);
    ctxBox.strokeRect(0, 0, canvasBox.width, canvasBox.height);
    if (logo) ctxBox.drawImage(logo, 20, 25, 140, 140);
    ctxBox.fillStyle = "#000";
    ctxBox.fillText("Ditandatangani secara elektronik oleh:", 180, 30);
    resolveSpecimen(form?.specimen ?? defaultSpecimen)
      .split("\n")
      .forEach((line, i) => {
        const y = 60 + i * 30;
        if (y >= canvasBox.height) return;
        ctxBox.fillText(line, 180, y);
      });
  };

  const drawQR = async () => {
    if (!ctxQR) return;
    const imgQR = await createImageBitmap(
      (await generateQRCode(
        { data: `${form?.nama ?? ""}\n${form?.instansi ?? ""}` },
        true,
      )) as Blob,
    );
    ctxQR.clearRect(0, 0, canvasQR.width, canvasQR.height);
    ctxQR.drawImage(imgQR, 0, 0, canvasQR.width, canvasQR.height);
  };

  const render = async () => {
    initCanvas();
    drawBox();
    await drawQR();
  };

  const download = (canvas?: HTMLCanvasElement, filename = "visual.png") => {
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const closeSpecimen = () => {
    specimenDialog?.close();
    onChange?.();
  };

  $effect(() => {
    form.nama;
    form.instansi;
    form.specimen;
    render();
  });
</script>

<img
  src="/favicon.png"
  onload={render}
  bind:this={logo}
  alt="logo"
  class="hidden"
/>

<div class="flex w-full flex-col items-center gap-3">
  <div
    class="relative flex w-full flex-col items-center gap-2 rounded-box p-2 outline-2 outline-dashed outline-offset-2 outline-primary/40"
  >
    <button
      type="button"
      class="btn btn-xs btn-square absolute right-2 top-2 z-10"
      title="Unduh QR Code"
      aria-label="Unduh QR Code"
      onclick={() => download(canvasQR, "qr-code.png")}
    >
      <iconify-icon icon="bx:download" class="text-base"></iconify-icon>
    </button>
    <div class="w-full text-center text-xs font-medium text-base-content/60">
      QR Code
    </div>
    <div
      class="flex aspect-[32/9] w-full items-center justify-center rounded-md"
    >
      <canvas
        bind:this={canvasQR}
        width="400"
        height="400"
        class="h-full w-full rounded-md bg-base-100 object-contain"
      ></canvas>
    </div>
  </div>

  <div
    class="relative flex w-full flex-col items-center gap-2 rounded-box p-2 outline-2 outline-dashed outline-offset-2 outline-primary/40"
  >
    <div class="absolute right-2 top-2 z-10 flex gap-1">
      <button
        type="button"
        class="btn btn-xs btn-square"
        title="Unduh kotak tanda tangan"
        aria-label="Unduh kotak tanda tangan"
        onclick={() => download(canvasBox, "tanda-tangan.png")}
      >
        <iconify-icon icon="bx:download" class="text-base"></iconify-icon>
      </button>
      <button
        type="button"
        class="btn btn-xs btn-square"
        title="Edit nilai"
        aria-label="Edit nilai"
        onclick={() => specimenDialog?.showModal()}
      >
        <iconify-icon icon="bx:edit" class="text-base"></iconify-icon>
      </button>
    </div>
    <div class="w-full text-center text-xs font-medium text-base-content/60">
      Kotak Tanda Tangan
    </div>
    <div class="aspect-[32/9] w-full rounded-md">
      <canvas
        bind:this={canvasBox}
        width="640"
        height="180"
        class="h-full w-full rounded-md bg-base-100 object-contain"
      ></canvas>
    </div>
  </div>
</div>

<dialog class="modal" bind:this={specimenDialog}>
  <div class="modal-box">
    <button
      type="button"
      class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
      aria-label="Tutup"
      onclick={closeSpecimen}
    >
      ✕
    </button>
    <h3 class="text-lg font-bold">Spesimen Tanda Tangan</h3>
    <p class="py-2 text-xs opacity-60">
      Satu baris = satu baris teks. Tulis nama field (jabatan, instansi, nama)
      untuk diisi otomatis. Baris kosong jadi jarak.
    </p>
    <textarea
      bind:value={
        () => resolveSpecimen(form.specimen ?? defaultSpecimen),
        (value) => (form.specimen = reverseSpecimen(value))
      }
      placeholder="Spesimen tanda tangan"
      class="textarea textarea-sm h-32 w-full"
    ></textarea>
    <div class="modal-action">
      <button type="button" class="btn btn-sm btn-primary" onclick={closeSpecimen}>
        Selesai
      </button>
    </div>
  </div>
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Tutup"
    onclick={closeSpecimen}
  ></button>
</dialog>
