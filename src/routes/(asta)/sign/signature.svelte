<script lang="ts">
  import { createId, generateQRCode } from "$lib/utils";
  import { untrack } from "svelte";
  import type { SignatureType } from "./types";
  type Visual = "image" | "qr" | "box" | "draw";

  let {
    form,
    setSignature,
    hasSignature,
    disabled = false,
    availableVisual = ["image", "qr", "box", "draw"],
    visual = $bindable("box"),
    onAddSignature,
  }: {
    form: Record<string, string>;
    hasSignature?: boolean;
    setSignature: (props: SignatureType) => void;
    disabled?: boolean;
    availableVisual?: Visual[];
    visual?: Visual;
    /** Called with the specimen template after a visualisation is added, so
     *  the caller can persist it into the specimen list. */
    onAddSignature?: (specimen: string) => void;
  } = $props();

  let imageSignature: FileList | undefined = $state();
  let logo = $state() as HTMLImageElement;

  let canvasImage = $state() as HTMLCanvasElement;
  let canvasBox = $state() as HTMLCanvasElement;
  let canvasPad = $state() as HTMLCanvasElement;
  let canvasQR = $state() as HTMLCanvasElement;

  let ctxImage = $state() as CanvasRenderingContext2D;
  let ctxBox = $state() as CanvasRenderingContext2D;
  let ctxPad = $state() as CanvasRenderingContext2D;
  let ctxQR = $state() as CanvasRenderingContext2D;

  type Point = { x: number; y: number };

  let strokes = $state<Point[][]>([]);
  let past = $state<Point[][][]>([]);
  let future = $state<Point[][][]>([]);
  let current = $state<Point[]>([]);
  let pointerId: number | null = null;
  let showName = $state(true);

  const canvasConfigs = {
    image: { originX: 10, originY: 10, width: 128, height: 128 },
    qr: { originX: 350, originY: 630, width: 100, height: 100 },
    box: { originX: 310, originY: 700, width: 200, height: 80 },
    draw: { originX: 310, originY: 640, width: 200, height: 100 },
  };

  // The pad is drawn in logical coordinates and supersampled so it stays
  // crisp when scaled down to the modal width (and on hi-dpi screens).
  const PAD_W = 640;
  const PAD_H = 320;
  const PAD_SCALE = 2;

  // Spesimen: lines matching an identity field stay linked to it (resolved
  // into the textarea/canvas), other lines are kept as literal text.
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

  let specimenDialog = $state<HTMLDialogElement>();

  let canvasMap = $derived({
    image: canvasImage,
    qr: canvasQR,
    draw: canvasPad,
    box: canvasBox,
  });

  const initCanvas = async () => {
    if (!canvasImage || !canvasPad || !canvasBox || !canvasQR) return;

    canvasPad.width = PAD_W * PAD_SCALE;
    canvasPad.height = PAD_H * PAD_SCALE;

    ctxImage = canvasImage.getContext("2d")!;
    ctxBox = canvasBox.getContext("2d")!;
    ctxPad = canvasPad.getContext("2d")!;
    ctxQR = canvasQR.getContext("2d")!;
    ctxPad.setTransform(PAD_SCALE, 0, 0, PAD_SCALE, 0, 0);

    ctxBox.font = "20px Arial";
    ctxBox.lineWidth = 5;

    renderPad();
    await drawStaticLayers();
    await loadImageSignature();
  };

  const drawPadBase = () => {
    ctxPad.fillStyle = "#fff";
    ctxPad.fillRect(0, 0, PAD_W, PAD_H);
    if (!showName) return;
    ctxPad.fillStyle = "#000";
    ctxPad.textAlign = "center";
    ctxPad.textBaseline = "middle";
    ctxPad.font = "28px Arial";
    ctxPad.fillText(form?.nama || "", PAD_W / 2, 300);
  };

  // signature_pad-style smoothing: quadratic curves through the midpoints of
  // consecutive points keep the stroke soft instead of a jagged polyline.
  const drawSmoothStroke = (stroke: Point[]) => {
    if (!stroke.length) return;
    if (stroke.length === 1) {
      ctxPad.beginPath();
      ctxPad.arc(
        stroke[0].x,
        stroke[0].y,
        ctxPad.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      ctxPad.fillStyle = ctxPad.strokeStyle;
      ctxPad.fill();
      return;
    }
    ctxPad.beginPath();
    ctxPad.moveTo(stroke[0].x, stroke[0].y);
    if (stroke.length < 3) {
      const last = stroke[stroke.length - 1];
      ctxPad.lineTo(last.x, last.y);
    } else {
      for (let i = 1; i < stroke.length - 1; i++) {
        const midX = (stroke[i].x + stroke[i + 1].x) / 2;
        const midY = (stroke[i].y + stroke[i + 1].y) / 2;
        ctxPad.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY);
      }
      const last = stroke[stroke.length - 1];
      ctxPad.lineTo(last.x, last.y);
    }
    ctxPad.stroke();
  };

  const renderPad = () => {
    if (!ctxPad) return;
    untrack(() => {
      drawPadBase();
      ctxPad.strokeStyle = "#1515bb"; // dark blue pen color
      ctxPad.lineWidth = 3;
      ctxPad.lineCap = "round";
      ctxPad.lineJoin = "round";
      for (const stroke of strokes) drawSmoothStroke(stroke);
      if (current.length) drawSmoothStroke(current);
    });
  };

  const cloneStrokes = (list: Point[][]) =>
    list.map((stroke) => stroke.map((p) => ({ ...p })));

  const commitStroke = () => {
    if (!current.length) {
      current = [];
      return;
    }
    past = [...past, cloneStrokes(strokes)];
    future = [];
    strokes = [...strokes, current];
    current = [];
  };

  const undo = () => {
    if (!past.length) return;
    future = [...future, cloneStrokes(strokes)];
    strokes = past[past.length - 1];
    past = past.slice(0, -1);
    renderPad();
  };

  const redo = () => {
    if (!future.length) return;
    past = [...past, cloneStrokes(strokes)];
    strokes = future[future.length - 1];
    future = future.slice(0, -1);
    renderPad();
  };

  const clearPad = () => {
    if (!strokes.length && !current.length) return;
    past = [...past, cloneStrokes(strokes)];
    future = [];
    strokes = [];
    current = [];
    renderPad();
  };

  const drawBox = () => {
    ctxBox.fillStyle = "#fff";
    ctxBox.fillRect(0, 0, canvasBox.width, canvasBox.height);
    ctxBox.strokeRect(0, 0, canvasBox.width, canvasBox.height);
    ctxBox.drawImage(logo, 20, 25, 140, 140);
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

  const drawStaticLayers = async () => {
    // Draw Signature Box
    drawBox();

    // Draw QR CODE
    const imgQR = await createImageBitmap(
      (await generateQRCode(
        { data: `${form?.nama}\n${form?.instansi}` },
        true,
      )) as Blob,
    );
    ctxQR.clearRect(0, 0, canvasQR.width, canvasQR.height);
    ctxQR.drawImage(imgQR, 0, 0, canvasQR.width, canvasQR.height);
  };

  const getPosition = (event: PointerEvent | MouseEvent) => {
    const rect = canvasPad.getBoundingClientRect();
    const scaleX = PAD_W / rect.width;
    const scaleY = PAD_H / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const minDistanceSq = 2.25; // 1.5px

  const startDrawing = (event: PointerEvent) => {
    if (disabled || pointerId !== null) return;
    pointerId = event.pointerId;
    canvasPad.setPointerCapture(event.pointerId);
    current = [getPosition(event)];
    renderPad();
  };

  const draw = (event: PointerEvent) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const points =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [event];
    for (const point of points) {
      const { x, y } = getPosition(point);
      const last = current[current.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy < minDistanceSq) continue;
      current = [...current, { x, y }];
    }
    renderPad();
  };

  const stopDrawing = (event: PointerEvent) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    pointerId = null;
    commitStroke();
    renderPad();
  };

  async function addSignature() {
    const canvas = canvasMap[visual];
    const config = canvasConfigs[visual];
    const imageBase64 = canvas
      .toDataURL()
      .replace("data:image/png;base64,", "");

    setSignature({
      id: createId(6),
      kind: "signature",
      imageBase64,
      page: 1,
      tampilan: "VISIBLE",
      originX: config.originX,
      originY: config.originY,
      width: config.width,
      // Derive the height from the canvas' intrinsic ratio so the placed
      // signature is never squashed by the preview's CSS size.
      height: (config.width / canvas.width) * canvas.height,
      location: "",
      reason: "",
    });

    // Keep the specimen used by this visualisation in the specimen list.
    onAddSignature?.(form.specimen ?? defaultSpecimen);
  }

  async function loadImageSignature() {
    if (!imageSignature || imageSignature.length === 0) return;
    const file = imageSignature[0];
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        canvasImage.width = img.width;
        canvasImage.height = img.height;
        ctxImage.drawImage(img, 0, 0);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  $effect(() => {
    if (form) initCanvas();
  });

  $effect(() => {
    form?.specimen;
    form?.jabatan;
    form?.instansi;
    form?.nama;
    if (ctxBox && logo) drawBox();
  });

  $effect(() => {
    form?.nama;
    if (ctxPad) renderPad();
  });

  $effect(() => {
    showName;
    if (ctxPad) renderPad();
  });

  $effect(() => {
    if (availableVisual.length && !availableVisual.includes(visual)) {
      visual = availableVisual[0];
    }
  });
</script>

<img
  bind:this={logo}
  src="/logo-mojokerto.png"
  onload={initCanvas}
  alt="logo"
  class="hidden"
/>

<div class="hidden" aria-hidden="true">
  <input
    type="file"
    accept="image/*"
    bind:files={imageSignature}
    onchange={loadImageSignature}
  />
  <canvas bind:this={canvasImage} width="640" height="320"></canvas>
  <canvas bind:this={canvasQR} width="400" height="400"></canvas>
  <canvas bind:this={canvasBox} width="640" height="180"></canvas>
</div>

<div class="flex flex-col gap-2 mt-1">
  <p class="text-xs leading-snug opacity-60">
    Buat coretan tanda tangan Anda pada kanvas di bawah, lalu tekan tombol
    tambah untuk menaruhnya ke dokumen.
  </p>
  {#if visual === "draw"}
    <div class="flex items-center gap-2">
      <label class="floating-label p-0 bg-transparent flex-1">
        <span>Nama penandatangan</span>
        <input
          type="text"
          bind:value={form.nama}
          placeholder="Nama penandatangan"
          class="input input-sm w-full"
          disabled={disabled}
        />
      </label>
      <label class="label cursor-pointer gap-2 shrink-0 py-0">
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          bind:checked={showName}
          disabled={disabled}
        />
        <span class="label-text text-xs">Tampilkan nama</span>
      </label>
    </div>
  {/if}
  <div class="relative">
    <canvas
      bind:this={canvasPad}
      class="border border-base-300 rounded-lg bg-white w-full h-auto touch-none"
      width="640"
      height="320"
      onpointerdown={startDrawing}
      onpointermove={draw}
      onpointerup={stopDrawing}
      onpointercancel={stopDrawing}
    ></canvas>
    <div class="absolute top-3 right-3 flex items-center gap-2">
      <button
        type="button"
        class="btn btn-sm btn-square"
        title="Undo"
        aria-label="Undo"
        disabled={!past.length || disabled}
        onclick={undo}
      >
        <iconify-icon icon="bx:undo" class="text-base"></iconify-icon>
      </button>
      <button
        type="button"
        class="btn btn-sm btn-square"
        title="Redo"
        aria-label="Redo"
        disabled={!future.length || disabled}
        onclick={redo}
      >
        <iconify-icon icon="bx:redo" class="text-base"></iconify-icon>
      </button>
      <button
        type="button"
        class="btn btn-sm"
        disabled={disabled}
        onclick={clearPad}
      >
        Clear
      </button>
    </div>
  </div>
  <button
    type="button"
    class="btn btn-secondary w-full"
    aria-label="Tambahkan tanda tangan ke dokumen"
    onclick={addSignature}
  >
    <iconify-icon icon="bx:plus" class="text-lg"></iconify-icon>
    Tambah ke Dokumen
  </button>
</div>

<dialog class="modal" bind:this={specimenDialog}>
  <div class="modal-box">
    <button
      type="button"
      class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
      aria-label="Tutup"
      onclick={() => specimenDialog?.close()}
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
      class="textarea textarea-sm w-full h-32"
      disabled={disabled}
    ></textarea>
    <div class="modal-action">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        onclick={() => specimenDialog?.close()}
      >
        Selesai
      </button>
    </div>
  </div>
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Tutup"
    onclick={() => specimenDialog?.close()}
  ></button>
</dialog>
