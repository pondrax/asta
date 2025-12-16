<script lang="ts">
  import { createId, generateQRCode } from "$lib/utils";
  import type { SignatureType } from "./types";
  type Visual = "image" | "qr" | "box" | "draw";

  let {
    form,
    setSignature,
    hasSignature,
    availableVisual = ["image", "qr", "box", "draw"],
  }: {
    form: Record<string, string>;
    hasSignature?: boolean;
    setSignature: (props: SignatureType) => void;
    availableVisual?: Visual[];
  } = $props();

  let imageSignature: FileList | undefined = $state();
  let logo = $state() as HTMLImageElement;
  let visual: Visual = $state("box");

  let canvasImage = $state() as HTMLCanvasElement;
  let canvasBox = $state() as HTMLCanvasElement;
  let canvasPad = $state() as HTMLCanvasElement;
  let canvasQR = $state() as HTMLCanvasElement;

  let ctxImage = $state() as CanvasRenderingContext2D;
  let ctxBox = $state() as CanvasRenderingContext2D;
  let ctxPad = $state() as CanvasRenderingContext2D;
  let ctxQR = $state() as CanvasRenderingContext2D;

  let drawing = $state(false);

  const canvasConfigs = {
    image: { originX: 10, originY: 10, width: 128, height: 128 },
    qr: { originX: 350, originY: 630, width: 100, height: 100 },
    box: { originX: 310, originY: 630, width: 200, height: 80 },
    draw: { originX: 310, originY: 630, width: 200, height: 100 },
  };

  let canvasMap = $derived({
    image: canvasImage,
    qr: canvasQR,
    draw: canvasPad,
    box: canvasBox,
  });

  const initCanvas = async () => {
    if (!canvasImage || !canvasPad || !canvasBox || !canvasQR) return;

    ctxImage = canvasImage.getContext("2d")!;
    ctxBox = canvasBox.getContext("2d")!;
    ctxPad = canvasPad.getContext("2d")!;
    ctxQR = canvasQR.getContext("2d")!;

    ctxBox.font = "20px Arial";
    ctxBox.lineWidth = 5;

    ctxPad.strokeStyle = "#1515bb"; // dark blue pen color
    ctxPad.font = "20px Arial";
    ctxPad.lineWidth = 3;

    clearPad();
    await drawStaticLayers();
    await loadImageSignature();
  };

  const clearPad = () => {
    ctxPad.fillStyle = "#fff";
    ctxPad.fillRect(0, 0, canvasPad.width, canvasPad.height);
    ctxPad.fillStyle = "#000";
    ctxPad.textAlign = "center";
    ctxPad.textBaseline = "middle";
    ctxPad.fillText(form?.nama || "", canvasPad.width / 2, 340);
  };

  const drawStaticLayers = async () => {
    // Draw Signature Box
    ctxBox.fillStyle = "#fff";
    ctxBox.fillRect(0, 0, canvasBox.width, canvasBox.height);
    ctxBox.strokeRect(0, 0, canvasBox.width, canvasBox.height);
    ctxBox.drawImage(logo, 20, 25, 140, 140);
    ctxBox.fillStyle = "#000";
    ctxBox.fillText("Ditandatangani secara elektronik oleh:", 180, 30);
    ctxBox.fillText(form?.jabatan || "", 180, 60);
    ctxBox.fillText(form?.instansi || "", 180, 90);
    ctxBox.fillText(form?.nama || "", 180, 150);

    // Draw Signature Pad
    ctxPad.fillStyle = "#fff";
    ctxPad.fillRect(0, 290, 640, 100);
    ctxPad.fillStyle = "#000";
    ctxPad.textAlign = "center";
    ctxPad.textBaseline = "middle";
    ctxPad.fillText(form?.nama || "", 320, 300);

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

  const getMousePosition = (event: MouseEvent | TouchEvent) => {
    const rect = canvasPad.getBoundingClientRect();
    const scaleX = canvasPad.width / rect.width;
    const scaleY = canvasPad.height / rect.height;

    if (event instanceof TouchEvent) {
      const touch = event.touches[0] || event.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (event: MouseEvent | TouchEvent) => {
    drawing = true;
    const { x, y } = getMousePosition(event);
    ctxPad.beginPath();
    ctxPad.moveTo(x, y);
  };

  const draw = (event: MouseEvent | TouchEvent) => {
    if (!drawing) return;
    const { x, y } = getMousePosition(event);
    ctxPad.lineTo(x, y);
    ctxPad.stroke();
  };

  const stopDrawing = () => {
    drawing = false;
    ctxPad?.closePath();
  };

  async function addSignature() {
    const canvas = canvasMap[visual];
    const config = canvasConfigs[visual];
    const imageBase64 = canvas
      .toDataURL()
      .replace("data:image/png;base64,", "");

    setSignature({
      id: createId(6),
      imageBase64,
      page: 1,
      tampilan: "VISIBLE",
      originX: config.originX,
      originY: config.originY,
      width: config.width,
      height: (config.width / canvas.clientWidth) * canvas.clientHeight,
      location: "",
      reason: "",
    });
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
    if (availableVisual.length && !availableVisual.includes(visual)) {
      visual = availableVisual[0];
    }
  });
</script>

<img
  bind:this={logo}
  src="/favicon.png"
  onload={initCanvas}
  alt="logo"
  class="hidden"
/>

<div class="tabs tabs-box bg-base-300 grow mt-1 gap-0">
  <label class="tab" class:invisible={!availableVisual.includes("image")}>
    <input type="radio" bind:group={visual} value="image" />
    <iconify-icon icon="bx:file"></iconify-icon>
    <span class="ml-1">Image</span>
  </label>
  <div class="tab-content relative">
    <input
      type="file"
      class="file-input file-input-sm mb-1 w-full"
      accept="image/*"
      bind:files={imageSignature}
      onchange={loadImageSignature}
    />
    <canvas
      bind:this={canvasImage}
      width="640"
      height="320"
      class="border border-base-300 rounded-lg bg-white w-full"
    ></canvas>
  </div>

  <label class="tab" class:invisible={!availableVisual.includes("qr")}>
    <input type="radio" bind:group={visual} value="qr" />
    <iconify-icon icon="bx:qr"></iconify-icon>
    <span class="ml-1">QR</span>
  </label>
  <div class="tab-content relative">
    <canvas
      bind:this={canvasQR}
      width="400"
      height="400"
      class="border border-base-300 rounded-lg bg-white h-48 mx-auto"
    ></canvas>
  </div>

  <label class="tab" class:invisible={!availableVisual.includes("box")}>
    <input type="radio" bind:group={visual} value="box" />
    <iconify-icon icon="bx:box"></iconify-icon>
    <span class="ml-1">Box</span>
  </label>
  <div class="tab-content relative">
    <canvas
      bind:this={canvasBox}
      class="border border-base-300 bg-white w-full"
      width="640"
      height="180"
    ></canvas>
  </div>

  <label class="tab" class:invisible={!availableVisual.includes("draw")}>
    <input type="radio" bind:group={visual} value="draw" />
    <iconify-icon icon="bx:pencil"></iconify-icon>
    <span class="ml-1">Draw</span>
  </label>
  <div class="tab-content relative">
    <canvas
      bind:this={canvasPad}
      class="border border-base-300 rounded-lg bg-white w-full h-48 touch-none"
      width="640"
      height="320"
      onmousedown={startDrawing}
      onmousemove={draw}
      onmouseup={stopDrawing}
      ontouchstart={startDrawing}
      ontouchmove={draw}
      ontouchend={stopDrawing}
    ></canvas>
    <button
      type="button"
      class="btn btn-sm absolute top-3 right-3"
      onclick={initCanvas}
    >
      Clear
    </button>
  </div>
  <div
    class="tab tooltip tooltip-left ml-auto"
    data-tip="Tambahkan visualisasi ke dokumen"
  >
    <button
      type="button"
      class="btn btn-secondary btn-square"
      aria-label="Tambahkan visualisasi ke dokumen"
      onclick={addSignature}
      disabled={hasSignature}
    >
      <iconify-icon icon="bx:plus" class="text-2xl"></iconify-icon>
    </button>
  </div>
</div>

<svelte:window
  onmousemove={draw}
  onmouseup={stopDrawing}
  ontouchmove={draw}
  ontouchend={stopDrawing}
/>
