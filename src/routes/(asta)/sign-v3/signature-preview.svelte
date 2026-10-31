<script lang="ts">
  import { generateQRCode } from "$lib/utils";
  import { setVisualDrag } from "$lib/app/visual-drag.svelte";

  type Visual = "qr" | "box";
  type AddPayload = {
    visual: Visual;
    imageBase64: string;
    width: number;
    height: number;
  };

  let {
    form = {},
    visual = "box",
    onAdd,
    disabled = false,
  }: {
    form?: Record<string, any>;
    visual?: Visual;
    onAdd?: (payload: AddPayload) => void;
    disabled?: boolean;
  } = $props();

  let canvas = $state() as HTMLCanvasElement;
  let ctx = $state() as CanvasRenderingContext2D;
  let logo = $state() as HTMLImageElement;

  const specimenKeys = ["jabatan", "instansi", "nama"];
  const defaultSpecimen = "jabatan\ninstansi\n\nnama";
  const title = $derived(visual === "qr" ? "QR Code" : "Kotak Tanda Tangan");

  const resolveSpecimen = (tpl: string) =>
    tpl
      .split("\n")
      .map((line) => {
        const key = line.trim();
        return key in form ? (form[key] ?? "") : line;
      })
      .join("\n")
      .replace(/^\n+|\n+$/g, "");

  const initCanvas = () => {
    if (!canvas) return;
    ctx = canvas.getContext("2d")!;
    ctx.font = "20px Arial";
  };

  const drawBox = () => {
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    if (logo) ctx.drawImage(logo, 20, 25, 140, 140);
    ctx.fillStyle = "#000";
    ctx.fillText("Ditandatangani secara elektronik oleh:", 180, 30);
    resolveSpecimen(form?.specimen ?? defaultSpecimen)
      .split("\n")
      .forEach((line, i) => {
        const y = 60 + i * 30;
        if (y >= canvas.height) return;
        ctx.fillText(line, 180, y);
      });
  };

  const drawQR = async () => {
    if (!ctx) return;
    const imgQR = await createImageBitmap(
      (await generateQRCode(
        { data: resolveSpecimen(form?.specimen ?? defaultSpecimen) },
        true,
      )) as Blob,
    );
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgQR, 0, 0, canvas.width, canvas.height);
  };

  const render = async () => {
    initCanvas();
    if (visual === "box") drawBox();
    else await drawQR();
  };

  const download = () => {
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = visual === "qr" ? "qr-code.png" : "tanda-tangan.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const add = () => {
    if (!canvas || !onAdd) return;
    onAdd(payload());
  };

  const payload = () => ({
    visual,
    // Bare base64 — the render side prepends `data:image/png;base64,` itself.
    imageBase64: canvas.toDataURL("image/png").replace("data:image/png;base64,", ""),
    width: canvas.width,
    height: canvas.height,
  });

  /** Hand the visual to a drop target (the PDF preview overlay). */
  const startDrag = (e: DragEvent) => {
    if (disabled || !canvas || !e.dataTransfer) return;
    e.dataTransfer.setData(
      "application/x-asta-visual",
      JSON.stringify(payload()),
    );
    e.dataTransfer.effectAllowed = "copy";
    // Hide the native drag image — the document overlay draws the visual at the
    // size it will actually occupy.
    const blank = document.createElement("canvas");
    blank.width = 1;
    blank.height = 1;
    e.dataTransfer.setDragImage(blank, 0, 0);
    setVisualDrag({
      visual,
      width: canvas.width,
      height: canvas.height,
      src: canvas.toDataURL("image/png"),
    });
  };

  $effect(() => {
    form.nama;
    form.instansi;
    form.specimen;
    render();
  });
</script>

<img
  src="/logo-mojokerto.png"
  onload={render}
  bind:this={logo}
  alt="logo"
  class="hidden"
/>

<div class="flex w-full items-center gap-2">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="min-w-0 flex-1 {disabled
      ? ''
      : 'cursor-grab active:cursor-grabbing'}"
    draggable={!disabled}
    ondragstart={startDrag}
    ondragend={() => setVisualDrag(null)}
  >
    <div class="text-center text-xs font-medium text-base-content/60">
      {title}
    </div>
    <div
      class={visual === "qr"
        ? "flex w-full items-center justify-center rounded-md py-1"
        : "flex aspect-[32/9] w-full items-center justify-center rounded-md"}
    >
      <canvas
        bind:this={canvas}
        width={visual === "qr" ? 400 : 640}
        height={visual === "qr" ? 400 : 180}
        class={visual === "qr"
          ? "h-24 w-24 rounded-md object-contain transition hover:bg-primary/10 hover:ring-2 hover:ring-primary/30"
          : "h-full w-full rounded-md object-contain transition hover:bg-primary/10 hover:ring-2 hover:ring-primary/30"}
      ></canvas>
    </div>
  </div>
  <div class="flex shrink-0 flex-col gap-1">
    <button
      type="button"
      class="btn btn-xs btn-square btn-soft btn-primary"
      title="Unduh"
      aria-label="Unduh"
      onclick={download}
    >
      <iconify-icon icon="bx:download" class="text-base"></iconify-icon>
    </button>
    {#if onAdd}
      <button
        type="button"
        class="btn btn-xs btn-square btn-soft btn-secondary"
        title="Tambah ke dokumen"
        aria-label="Tambah ke dokumen"
        {disabled}
        onclick={add}
      >
        <iconify-icon icon="bx:plus" class="text-base"></iconify-icon>
      </button>
    {/if}
  </div>
</div>
