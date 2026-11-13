<script lang="ts">
  import { onMount } from "svelte";

  let { data } = $props();

  interface Endpoint {
    id: string;
    name: string;
    method: string;
    path: string;
    folder: string;
    category: string;
    description: string;
    headers: Array<{ key: string; value: string; disabled?: boolean }>;
    rawBody?: string;
    sampleResponse?: any;
  }

  // Server selection: dev | prod | manual
  let serverTarget = $state<"dev" | "prod" | "manual">("dev");
  let manualServerUrl = $state("");
  const devUrl = data?.defaultDevUrl || "https://dev-esign.mojokertokota.go.id";
  const prodUrl = data?.defaultProdUrl || "https://esign.mojokertokota.go.id";

  const effectiveServerUrl = $derived(
    serverTarget === "dev"
      ? devUrl
      : serverTarget === "prod"
      ? prodUrl
      : manualServerUrl || "https://"
  );

  // Auth: Basic Auth
  let authUsername = $state("");
  let authPassword = $state("");

  // Endpoints data
  let endpoints = $state<Endpoint[]>([]);
  let selectedEndpointId = $state<string>("");
  let searchQuery = $state("");
  let selectedCategory = $state("all");

  // Per-endpoint inputs
  let customPath = $state("");
  let reqRawBody = $state("");
  let pathParams = $state<Record<string, string>>({});

  // Global persistent placeholders across API switching (in-memory, resets on doc reload)
  let placeholders = $state<Record<string, string>>({
    nik: "",
    email: "",
    passphrase: "",
    totp: "",
    idSubscriber: "",
    id_subscriber: "",
    id_subsciber: "",
    data: "1",
    pdf_base64: "",
    image_ttd_base64: "",
    pdf_signed: "",
    pdf_with_password_base64: "",
    password_for_pdf: "",
  });

  // Execution state
  let isLoading = $state(false);
  let responseData = $state<any>(null);
  let responseStatus = $state<number | null>(null);
  let responseStatusText = $state<string>("");
  let responseHeaders = $state<Record<string, string>>({});
  let responseTime = $state<number | null>(null);

  // Tabs on Response (right side)
  let activeResponseTab = $state<"body" | "headers" | "curl" | "php" | "fetch">("body");

  // Modal Base64 Converter Tool
  let showToolModal = $state(false);
  let convertMode = $state<"encode" | "decode">("encode");
  let fileToEncode = $state<File | null>(null);
  let encodedBase64 = $state("");
  let encodedMime = $state("");
  let decodeInputBase64 = $state("");
  let decodedBlobUrl = $state("");
  let decodedType = $state<"pdf" | "image" | "unknown">("unknown");
  let copyNotice = $state(false);

  function mapCategory(folderName: string): string {
    const f = folderName.toLowerCase();
    if (f.includes("sign")) return "Sign PDF";
    if (f.includes("seal")) return "Sign E-Seal";
    if (f.includes("user")) return "User";
    if (f.includes("verify")) return "Verify PDF";
    return "Lainnya";
  }

  function getFallbackSampleResponse(path: string, method: string, name: string): any {
    const p = path.toLowerCase();
    if (p.includes("/user/check/status")) {
      return {
        status: "SUCCESS",
        message: "Pengguna ditemukan",
        data: {
          nik: "357401xxxxxxxxxx",
          nama: "NAMA PEGAWAI",
          email: "pegawai@mojokertokota.go.id",
          status_user: "AKTIF",
          status_sertifikat: "ISSUE"
        }
      };
    }
    if (p.includes("/sign/get/totp")) {
      return {
        status: "SUCCESS",
        message: "OTP berhasil dikirim ke nomor/email terdaftar",
        data: { expired_in_seconds: 120 }
      };
    }
    if (p.includes("/sign/pdf")) {
      return {
        status: "SUCCESS",
        message: "Dokumen berhasil ditandatangani",
        id_dokumen: "DOC-202611-987654",
        file: ["JVBERi0xLjQKJ... [Base64 PDF Hasil Tandatangan]"]
      };
    }
    if (p.includes("/seal/enrollment")) {
      return {
        success: true,
        message: "Permohonan ISSUE sertifikat Segel berhasil, silahkan cek email organisasi"
      };
    }
    if (p.includes("/seal/get/activation") || p.includes("/seal/revoke/activation")) {
      return {
        message: "Aktivasi OTP berhasil diproses"
      };
    }
    if (p.includes("/seal/pdf")) {
      return {
        status: "SUCCESS",
        message: "Dokumen berhasil disegel elektronik",
        file: ["JVBERi0xLjQKJ... [Base64 PDF Hasil Segel]"]
      };
    }
    if (p.includes("/verify/pdf")) {
      return {
        status: "SUCCESS",
        message: "Dokumen valid dan terverifikasi",
        jumlah_signature: 1,
        details: [
          {
            nama_penandatangan: "KADIS KOMINFO KOTA MOJOKERTO",
            tanggal_penandatanganan: "2026-11-12 14:20:00",
            status_dokumen: "VALID",
            keterangan: "Sertifikat diterbitkan oleh BSrE BSSN",
            integritas_dokumen: "DOKUMEN_ASLI_TIDAK_DIMODIFIKASI"
          }
        ]
      };
    }
    return {
      status: "SUCCESS",
      message: "Operasi API v2 berhasil"
    };
  }

  function parseV2Collection(v2Node: any, folderName = ""): Endpoint[] {
    const list: Endpoint[] = [];
    if (!v2Node || !v2Node.item) return list;

    function walk(items: any[], currentFolder: string) {
      for (const item of items) {
        if (item.item) {
          const nextFolder = currentFolder
            ? `${currentFolder} / ${item.name}`
            : item.name;
          walk(item.item, nextFolder);
        } else if (item.request) {
          const req = item.request;
          const method = (req.method || "GET").toUpperCase();
          let rawUrl = "";
          let pathStr = "";

          if (typeof req.url === "object" && req.url !== null) {
            rawUrl = req.url.raw || "";
            pathStr = Array.isArray(req.url.path)
              ? `/${req.url.path.join("/")}`
              : "";
          } else if (typeof req.url === "string") {
            rawUrl = req.url;
            pathStr = rawUrl.replace("{{baseURL}}", "");
          }

          const b = req.body || {};
          let sampleResp = null;
          if (item.response && item.response.length > 0 && item.response[0].body) {
            try {
              sampleResp = JSON.parse(item.response[0].body);
            } catch {
              sampleResp = item.response[0].body;
            }
          }
          if (!sampleResp) {
            sampleResp = getFallbackSampleResponse(pathStr, method, item.name);
          }

          const ep: Endpoint = {
            id: `${method}:${pathStr}:${item.name}`,
            name: item.name,
            method,
            path: pathStr,
            folder: currentFolder,
            category: mapCategory(currentFolder),
            description: req.description || item.description || "",
            headers: req.header || [],
            rawBody: b.raw || "",
            sampleResponse: sampleResp,
          };
          list.push(ep);
        }
      }
    }

    walk(v2Node.item, "");
    return list;
  }

  onMount(async () => {
    try {
      const res = await fetch("/data/esign-collection.json");
      const coll = await res.json();
      const v2Folder = coll.item?.find(
        (i: any) => i.name === "API v2" || i.name?.includes("v2")
      );
      endpoints = v2Folder ? parseV2Collection(v2Folder) : parseV2Collection(coll);
      if (endpoints.length > 0) {
        selectEndpoint(endpoints[0]);
      }
    } catch (e) {
      console.error("Failed to load v2 postman collection:", e);
    }
  });

  const selectedEndpoint = $derived(
    endpoints.find((e) => e.id === selectedEndpointId)
  );

  const categories = ["all", "Sign PDF", "Sign E-Seal", "User", "Verify PDF"];

  const filteredEndpoints = $derived(
    endpoints.filter((ep) => {
      const matchCat =
        selectedCategory === "all" || ep.category === selectedCategory;
      const matchQuery =
        !searchQuery ||
        ep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.method.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.folder.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    })
  );

  // Extract all placeholders that exist in current endpoint raw body
  const currentBodyPlaceholders = $derived.by(() => {
    if (!selectedEndpoint?.rawBody) return [];
    const matches = selectedEndpoint.rawBody.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ""))));
  });

  function selectEndpoint(ep: Endpoint) {
    selectedEndpointId = ep.id;
    customPath = ep.path;
    reqRawBody = ep.rawBody || "";
    responseData = null;
    responseStatus = null;
    responseStatusText = "";
    responseHeaders = {};
    responseTime = null;

    // Detect path variables e.g. :id
    const pathMatches = ep.path.match(/:([a-zA-Z0-9_]+)/g) || [];
    const pParams: Record<string, string> = {};
    pathMatches.forEach((m) => {
      const key = m.replace(":", "");
      pParams[key] = pathParams[key] || "";
    });
    pathParams = pParams;

    // Ensure placeholders dictionary has keys for this endpoint without clearing existing user values
    const bodyMatches = ep.rawBody ? ep.rawBody.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [] : [];
    bodyMatches.forEach((m) => {
      const cleanKey = m.replace(/\{\{|\}\}/g, "");
      if (placeholders[cleanKey] === undefined) {
        placeholders[cleanKey] = "";
      }
    });
  }

  // Resolved path with pathParams replaced
  const resolvedPath = $derived.by(() => {
    let p = customPath;
    for (const [key, val] of Object.entries(pathParams)) {
      p = p.replace(`:${key}`, encodeURIComponent(val || `:${key}`));
    }
    return p.startsWith("/") ? p : `/${p}`;
  });

  // Resolved target URL
  const resolvedTargetUrl = $derived.by(() => {
    const cleanBase = (effectiveServerUrl || "").replace(/\/+$/, "");
    return `${cleanBase}${resolvedPath}`;
  });

  // Effective body after replacing {{placeholder}} with user inputs
  const resolvedBody = $derived.by(() => {
    let body = reqRawBody;
    for (const [key, val] of Object.entries(placeholders)) {
      if (val) {
        body = body.replaceAll(`{{${key}}}`, val);
      }
    }
    return body;
  });

  // Code Snippet Generators (cURL, PHP, JS Fetch)
  const curlSnippet = $derived.by(() => {
    if (!selectedEndpoint) return "";
    let lines = [`curl --location --request ${selectedEndpoint.method} '${resolvedTargetUrl}'`];
    if (authUsername || authPassword) {
      lines.push(`  --user '${authUsername}:${authPassword}'`);
    }
    lines.push(`  --header 'Content-Type: application/json'`);
    if (["POST", "PUT", "PATCH"].includes(selectedEndpoint.method) && resolvedBody.trim()) {
      lines.push(`  --data-raw '${resolvedBody.replace(/'/g, "'\\''")}'`);
    }
    return lines.join(" \\\n");
  });

  const phpSnippet = $derived.by(() => {
    if (!selectedEndpoint) return "";
    let authSetup = "";
    if (authUsername || authPassword) {
      authSetup = `curl_setopt($curl, CURLOPT_USERPWD, "${authUsername}:${authPassword}");\n`;
    }
    let bodySetup = "";
    if (["POST", "PUT", "PATCH"].includes(selectedEndpoint.method) && resolvedBody.trim()) {
      bodySetup = `curl_setopt($curl, CURLOPT_POSTFIELDS, ${JSON.stringify(resolvedBody)});\n`;
    }

    return `<?php

$curl = curl_init();

curl_setopt_array($curl, [
  CURLOPT_URL => "${resolvedTargetUrl}",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST => "${selectedEndpoint.method}",
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json"
  ],
]);
${authSetup}${bodySetup}
$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #: " . $err;
} else {
  echo $response;
}`;
  });

  const fetchSnippet = $derived.by(() => {
    if (!selectedEndpoint) return "";
    let bodyCode = "";
    if (["POST", "PUT", "PATCH"].includes(selectedEndpoint.method) && resolvedBody.trim()) {
      bodyCode = `,\n  body: JSON.stringify(${resolvedBody.trim()})`;
    }

    const hasAuth = Boolean(authUsername || authPassword);

    return `${hasAuth ? `const authHeader = "Basic " + btoa("${authUsername}:${authPassword}");\n\n` : ""}const response = await fetch("${resolvedTargetUrl}", {
  method: "${selectedEndpoint.method}",
  headers: {
    "Content-Type": "application/json"${hasAuth ? ',\n    "Authorization": authHeader' : ""}
  }${bodyCode}
});

const data = await response.json();
console.log(data);`;
  });

  async function executeRequest() {
    if (!selectedEndpoint) return;
    isLoading = true;
    responseData = null;
    responseStatus = null;
    const start = performance.now();

    try {
      let authHeader = "";
      if (authUsername || authPassword) {
        authHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
      }

      const payload: Record<string, any> = {
        __targetUrl: resolvedTargetUrl,
        __method: selectedEndpoint.method,
        __auth: authHeader,
      };

      if (
        ["POST", "PUT", "PATCH"].includes(selectedEndpoint.method) &&
        resolvedBody
      ) {
        try {
          payload.__body = JSON.parse(resolvedBody);
        } catch {
          payload.__body = resolvedBody;
        }
      }

      const res = await fetch("/api/integrasi/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      responseTime = Math.round(performance.now() - start);
      const resJson = await res.json();

      responseStatus = resJson.status || res.status;
      responseStatusText = resJson.statusText || "";
      responseHeaders = resJson.headers || {};
      responseData = resJson;
    } catch (err: any) {
      responseTime = Math.round(performance.now() - start);
      responseStatus = 500;
      responseStatusText = "Error";
      responseData = { error: err?.message || "Gagal menghubungi proxy" };
    } finally {
      isLoading = false;
    }
  }

  // Base64 converter handlers
  function handleEncodeFile(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      fileToEncode = file;
      encodedMime = file.type || "application/octet-stream";
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Index = result.indexOf(";base64,");
        encodedBase64 = base64Index !== -1 ? result.substring(base64Index + 8) : result;
      };
      reader.readAsDataURL(file);
    }
  }

  function handleDecode() {
    let raw = decodeInputBase64.trim();
    if (!raw) return;
    if (raw.startsWith("data:")) {
      const comma = raw.indexOf(",");
      if (comma !== -1) raw = raw.slice(comma + 1);
    }

    try {
      const binaryString = atob(raw);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (raw.startsWith("JVBERi0") || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        decodedType = "pdf";
        const blob = new Blob([bytes], { type: "application/pdf" });
        if (decodedBlobUrl) URL.revokeObjectURL(decodedBlobUrl);
        decodedBlobUrl = URL.createObjectURL(blob);
      } else {
        decodedType = "image";
        const blob = new Blob([bytes], { type: "image/png" });
        if (decodedBlobUrl) URL.revokeObjectURL(decodedBlobUrl);
        decodedBlobUrl = URL.createObjectURL(blob);
      }
    } catch (e: any) {
      alert("Format Base64 tidak valid: " + e.message);
    }
  }

  function copyText(txt: string) {
    navigator.clipboard.writeText(txt);
    copyNotice = true;
    setTimeout(() => (copyNotice = false), 2000);
  }

  function getMethodBadge(method: string) {
    switch (method.toUpperCase()) {
      case "GET":
        return "badge-success";
      case "POST":
        return "badge-primary";
      case "PUT":
        return "badge-warning";
      case "DELETE":
        return "badge-error";
      default:
        return "badge-neutral";
    }
  }
</script>

<div class="h-[calc(100vh-3.5rem)] flex flex-col bg-base-100 overflow-hidden">
  <!-- Top bar: Configuration -->
  <header
    class="border-b border-base-300 bg-base-200/50 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0"
  >
    <div class="flex items-center gap-3">
      <a
        href="/integrasi"
        class="btn btn-ghost btn-sm btn-square"
        title="Kembali ke Panduan Integrasi"
      >
        <iconify-icon icon="solar:arrow-left-outline" class="text-lg"></iconify-icon>
      </a>
      <div>
        <h1 class="text-sm font-bold flex items-center gap-1.5">
          <iconify-icon icon="solar:bolt-circle-bold" class="text-primary"></iconify-icon>
          BSrE API Playground v2
        </h1>
        <p class="text-[11px] text-base-content/60">
          Uji coba interaktif API v2 (User, Sign PDF, Sign E-Seal, Verify PDF)
        </p>
      </div>
    </div>

    <!-- Right Controls: Tools Modal Button + Postman Download + Server & Auth Config -->
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <!-- Sticky Tool Button left of Postman JSON -->
      <button
        class="btn btn-xs btn-primary gap-1 font-medium shadow-xs"
        onclick={() => (showToolModal = true)}
      >
        <iconify-icon icon="solar:refresh-square-outline" class="text-sm"></iconify-icon>
        Tool Base64
      </button>

      <a
        href="/data/esign-collection.json"
        download="Esign-Client-Service-v2.postman_collection.json"
        class="btn btn-xs btn-outline gap-1 font-medium"
      >
        <iconify-icon icon="solar:download-square-outline" class="text-sm"></iconify-icon>
        Postman JSON
      </a>

      <!-- Environment Selector: Dev / Prod / Manual -->
      <div class="join">
        <select
          class="join-item select select-xs select-bordered font-mono font-medium"
          bind:value={serverTarget}
        >
          <option value="dev">Dev Client</option>
          <option value="prod">Prod Client</option>
          <option value="manual">Manual URL</option>
        </select>
        {#if serverTarget === "manual"}
          <input
            type="text"
            class="join-item input input-xs input-bordered w-48 lg:w-60 font-mono"
            bind:value={manualServerUrl}
            placeholder="https://ip-or-domain:8081"
          />
        {:else}
          <span
            class="join-item input input-xs input-bordered w-48 lg:w-60 font-mono text-base-content/70 flex items-center bg-base-200/50 truncate"
            title={effectiveServerUrl}
          >
            {effectiveServerUrl}
          </span>
        {/if}
      </div>

      <!-- Basic Auth Credentials -->
      <div class="join">
        <span class="join-item btn btn-xs btn-neutral font-mono pointer-events-none" title="Basic Auth">Auth</span>
        <input
          type="text"
          class="join-item input input-xs input-bordered w-24 md:w-28 font-mono"
          bind:value={authUsername}
          placeholder="username"
        />
        <input
          type="password"
          class="join-item input input-xs input-bordered w-24 md:w-28 font-mono"
          bind:value={authPassword}
          placeholder="password"
          autocomplete="off"
        />
      </div>
    </div>
  </header>

  <!-- Main Body: Sidebar + Workspace -->
  <div class="flex flex-1 overflow-hidden">
    <!-- Sidebar: v2 Categories & Endpoints -->
    <aside
      class="w-72 lg:w-80 border-r border-base-300 bg-base-100 flex flex-col shrink-0 overflow-hidden"
    >
      <div class="p-3 border-b border-base-300 space-y-2">
        <input
          type="text"
          class="input input-xs input-bordered w-full"
          placeholder="Cari endpoint v2..."
          bind:value={searchQuery}
        />
        <div class="flex gap-1 overflow-x-auto pb-1 text-xs">
          {#each categories as cat}
            <button
              class="btn btn-xs whitespace-nowrap {selectedCategory === cat
                ? 'btn-neutral'
                : 'btn-ghost'}"
              onclick={() => (selectedCategory = cat)}
            >
              {cat === "all" ? "Semua v2" : cat}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex-1 overflow-y-auto divide-y divide-base-200">
        {#if filteredEndpoints.length === 0}
          <div class="p-6 text-center text-xs text-base-content/50">
            Tidak ada endpoint ditemukan
          </div>
        {:else}
          {#each filteredEndpoints as ep}
            <button
              class="w-full text-left p-3 hover:bg-base-200/60 transition flex flex-col gap-1 {selectedEndpointId ===
              ep.id
                ? 'bg-primary/10 border-l-4 border-primary'
                : ''}"
              onclick={() => selectEndpoint(ep)}
            >
              <div class="flex items-center gap-1.5">
                <span
                  class="badge badge-xs {getMethodBadge(ep.method)} font-mono font-bold"
                >
                  {ep.method}
                </span>
                <span class="text-xs font-semibold truncate flex-1">{ep.name}</span>
              </div>
              <div class="text-[11px] font-mono text-base-content/60 truncate">
                {ep.path}
              </div>
              <div class="flex items-center justify-between text-[10px] text-base-content/40">
                <span class="truncate">{ep.folder}</span>
                <span class="badge badge-ghost badge-xs">{ep.category}</span>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </aside>

    <!-- Main Playground Workspace -->
    <main class="flex-1 flex flex-col overflow-hidden bg-base-100">
      {#if selectedEndpoint}
        <!-- Endpoint Header Bar -->
        <div class="p-3.5 border-b border-base-300 bg-base-200/30 space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-[10px] text-base-content/60 uppercase tracking-wider font-semibold">
                {selectedEndpoint.folder}
              </div>
              <h2 class="text-base font-bold flex items-center gap-2">
                {selectedEndpoint.name}
              </h2>
            </div>
            <div class="flex items-center gap-2">
              {#if copyNotice}
                <span class="text-xs text-success font-semibold animate-pulse">Tersalin!</span>
              {/if}
              <button
                class="btn btn-primary btn-sm gap-2"
                onclick={executeRequest}
                disabled={isLoading}
              >
                {#if isLoading}
                  <span class="loading loading-spinner loading-xs"></span>
                  Mengirim...
                {:else}
                  <iconify-icon icon="solar:plain-bold" class="text-base"></iconify-icon>
                  Kirim Request
                {/if}
              </button>
            </div>
          </div>

          <!-- URL Bar -->
          <div class="join w-full">
            <span
              class="join-item btn btn-sm {getMethodBadge(
                selectedEndpoint.method
              )} font-mono font-bold pointer-events-none"
            >
              {selectedEndpoint.method}
            </span>
            <input
              type="text"
              class="join-item input input-sm input-bordered w-full font-mono text-xs"
              bind:value={customPath}
              placeholder="/api/..."
            />
          </div>
        </div>

        <!-- Grid: Request Config (Left) + Response / Snippets (Right) -->
        <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
          <!-- Left Workspace: Request Config, Path Params, Preserved Placeholders, JSON Body -->
          <div class="flex flex-col border-b lg:border-b-0 lg:border-r border-base-300 overflow-y-auto p-4 space-y-4">
            <!-- Path Parameters (:id, :nik, etc.) -->
            {#if Object.keys(pathParams).length > 0}
              <div class="space-y-2">
                <div class="text-xs font-bold text-base-content/70 flex items-center gap-1">
                  <iconify-icon icon="solar:tuning-bold"></iconify-icon>
                  Path Parameters
                </div>
                <div class="space-y-2 bg-base-200/40 p-3 rounded-box border border-base-200">
                  {#each Object.keys(pathParams) as paramKey}
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-mono font-semibold w-24 shrink-0">:{paramKey}</span>
                      <input
                        type="text"
                        class="input input-xs input-bordered w-full font-mono"
                        bind:value={pathParams[paramKey]}
                        placeholder={`Nilai :${paramKey}`}
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Separate Placeholder Inputs: Preserved across API changes -->
            {#if currentBodyPlaceholders.length > 0}
              <div class="space-y-2">
                <div class="text-xs font-bold text-base-content/70 flex items-center justify-between">
                  <span class="flex items-center gap-1">
                    <iconify-icon icon="solar:tag-bold"></iconify-icon>
                    Body Placeholders
                  </span>
                  <span class="badge badge-xs badge-info badge-outline font-mono">Nilai tersimpan saat ganti endpoint</span>
                </div>
                <div class="space-y-2.5 bg-base-200/40 p-3 rounded-box border border-base-200">
                  {#each currentBodyPlaceholders as phKey}
                    <div class="flex flex-col gap-1">
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-mono font-semibold text-primary">{`{{${phKey}}}`}</span>
                        {#if phKey.includes("base64") || phKey.includes("pdf")}
                          <button
                            class="link link-primary text-[10px]"
                            onclick={() => (showToolModal = true)}
                          >
                            Buka Tool Base64
                          </button>
                        {/if}
                      </div>
                      {#if phKey.includes("base64") || phKey.includes("pdf")}
                        <textarea
                          class="textarea textarea-xs textarea-bordered w-full font-mono text-[10px] h-16"
                          bind:value={placeholders[phKey]}
                          placeholder={`Nilai untuk {{${phKey}}}...`}
                        ></textarea>
                      {:else if phKey.includes("passphrase") || phKey.includes("password")}
                        <input
                          type="password"
                          class="input input-xs input-bordered w-full font-mono"
                          bind:value={placeholders[phKey]}
                          placeholder={`Nilai untuk {{${phKey}}}...`}
                          autocomplete="off"
                        />
                      {:else}
                        <input
                          type="text"
                          class="input input-xs input-bordered w-full font-mono"
                          bind:value={placeholders[phKey]}
                          placeholder={`Nilai untuk {{${phKey}}}...`}
                        />
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- JSON Body -->
            <div class="space-y-2 flex-1 flex flex-col">
              <div class="text-xs font-bold text-base-content/70 flex items-center justify-between">
                <span class="flex items-center gap-1">
                  <iconify-icon icon="solar:code-bold"></iconify-icon>
                  JSON Request Body
                </span>
                <span class="badge badge-xs badge-neutral font-mono">application/json</span>
              </div>
              <textarea
                class="textarea textarea-bordered font-mono text-xs w-full flex-1 min-h-64 leading-relaxed bg-base-100"
                bind:value={reqRawBody}
                placeholder={`{\n  "nik": "..."\n}`}
                spellcheck="false"
              ></textarea>
            </div>

            {#if selectedEndpoint.description}
              <div class="space-y-1 pt-2 border-t border-base-200">
                <div class="text-xs font-semibold text-base-content/60">
                  Keterangan:
                </div>
                <p class="text-xs text-base-content/80 whitespace-pre-line leading-relaxed">
                  {selectedEndpoint.description}
                </p>
              </div>
            {/if}
          </div>

          <!-- Right Workspace: Response & Sample & Code Snippets Tabs -->
          <div class="flex flex-col overflow-hidden bg-base-200/20">
            <!-- Tabs Bar: Body, Headers, cURL, PHP, JS Fetch -->
            <div class="flex border-b border-base-300 bg-base-100 px-3 text-xs justify-between items-center">
              <div class="flex">
                <button
                  class="py-2.5 px-3 border-b-2 font-medium transition {activeResponseTab ===
                  'body'
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-base-content/60'}"
                  onclick={() => (activeResponseTab = "body")}
                >
                  Response Body
                </button>
                <button
                  class="py-2.5 px-3 border-b-2 font-medium transition {activeResponseTab ===
                  'headers'
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-base-content/60'}"
                  onclick={() => (activeResponseTab = "headers")}
                >
                  Headers ({Object.keys(responseHeaders).length})
                </button>
                <button
                  class="py-2.5 px-3 border-b-2 font-medium transition {activeResponseTab ===
                  'curl'
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-base-content/60'}"
                  onclick={() => (activeResponseTab = "curl")}
                >
                  cURL
                </button>
                <button
                  class="py-2.5 px-3 border-b-2 font-medium transition {activeResponseTab ===
                  'php'
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-base-content/60'}"
                  onclick={() => (activeResponseTab = "php")}
                >
                  PHP
                </button>
                <button
                  class="py-2.5 px-3 border-b-2 font-medium transition {activeResponseTab ===
                  'fetch'
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-base-content/60'}"
                  onclick={() => (activeResponseTab = "fetch")}
                >
                  JS Fetch
                </button>
              </div>

              <!-- Status badge & time -->
              <div class="flex items-center gap-2 py-1">
                {#if responseStatus !== null}
                  <span
                    class="badge badge-xs font-mono font-bold {responseStatus >=
                      200 && responseStatus < 300
                      ? 'badge-success'
                      : 'badge-error'}"
                  >
                    {responseStatus}
                  </span>
                {/if}
                {#if responseTime !== null}
                  <span class="text-[10px] font-mono text-base-content/60">
                    {responseTime}ms
                  </span>
                {/if}
              </div>
            </div>

            <!-- Tab Content View -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
              {#if activeResponseTab === "curl"}
                <div class="relative h-full flex flex-col">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold text-base-content/70">Snippet cURL</span>
                    <button class="btn btn-xs btn-ghost gap-1" onclick={() => copyText(curlSnippet)}>
                      <iconify-icon icon="solar:copy-outline"></iconify-icon>
                      Salin
                    </button>
                  </div>
                  <pre class="bg-base-100 p-4 rounded-box font-mono text-xs overflow-x-auto leading-relaxed border border-base-300 flex-1">{curlSnippet}</pre>
                </div>
              {:else if activeResponseTab === "php"}
                <div class="relative h-full flex flex-col">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold text-base-content/70">Snippet PHP (cURL)</span>
                    <button class="btn btn-xs btn-ghost gap-1" onclick={() => copyText(phpSnippet)}>
                      <iconify-icon icon="solar:copy-outline"></iconify-icon>
                      Salin
                    </button>
                  </div>
                  <pre class="bg-base-100 p-4 rounded-box font-mono text-xs overflow-x-auto leading-relaxed border border-base-300 flex-1">{phpSnippet}</pre>
                </div>
              {:else if activeResponseTab === "fetch"}
                <div class="relative h-full flex flex-col">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold text-base-content/70">Snippet JavaScript Fetch</span>
                    <button class="btn btn-xs btn-ghost gap-1" onclick={() => copyText(fetchSnippet)}>
                      <iconify-icon icon="solar:copy-outline"></iconify-icon>
                      Salin
                    </button>
                  </div>
                  <pre class="bg-base-100 p-4 rounded-box font-mono text-xs overflow-x-auto leading-relaxed border border-base-300 flex-1">{fetchSnippet}</pre>
                </div>
              {:else if activeResponseTab === "headers"}
                <div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
                  <table class="table table-xs font-mono">
                    <thead>
                      <tr>
                        <th>Header</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#if Object.keys(responseHeaders).length === 0}
                        <tr><td colspan="2" class="text-center text-base-content/40 py-4">Belum ada header respon</td></tr>
                      {:else}
                        {#each Object.entries(responseHeaders) as [k, v]}
                          <tr>
                            <td class="font-bold text-primary">{k}</td>
                            <td class="break-all">{v}</td>
                          </tr>
                        {/each}
                      {/if}
                    </tbody>
                  </table>
                </div>
              {:else}
                <!-- Response Body section -->
                <div class="space-y-2">
                  <div class="text-xs font-bold text-base-content/70 flex items-center justify-between">
                    <span>Hasil Eksekusi Response:</span>
                    {#if responseStatus !== null}
                      <span class="text-[11px] font-mono text-base-content/50">
                        Status: {responseStatus} {responseStatusText}
                      </span>
                    {/if}
                  </div>

                  {#if isLoading}
                    <div class="p-8 flex flex-col items-center justify-center gap-2 text-base-content/50 bg-base-100 rounded-box border border-base-300">
                      <span class="loading loading-spinner loading-md text-primary"></span>
                      <span class="text-xs font-mono">Menghubungi endpoint BSrE API v2...</span>
                    </div>
                  {:else if responseData !== null}
                    {#if responseData.isBinary && responseData.contentType?.includes("pdf")}
                      <div class="space-y-3">
                        <div class="alert alert-info text-xs">
                          <iconify-icon icon="solar:file-check-outline" class="text-lg"></iconify-icon>
                          Dokumen PDF berhasil diterima dari server BSrE.
                        </div>
                        <iframe
                          src={responseData.data}
                          title="PDF Output"
                          class="w-full h-80 rounded-box border border-base-300"
                        ></iframe>
                      </div>
                    {:else}
                      <pre
                        class="font-mono text-xs bg-base-100 p-4 rounded-box border border-base-300 overflow-x-auto select-all leading-relaxed">{JSON.stringify(
                          responseData.data !== undefined ? responseData.data : responseData,
                          null,
                          2
                        )}</pre>
                    {/if}
                  {:else}
                    <div class="p-8 flex flex-col items-center justify-center text-center text-base-content/40 bg-base-100 rounded-box border border-base-300">
                      <iconify-icon icon="solar:play-circle-outline" class="text-3xl mb-1"></iconify-icon>
                      <p class="text-xs">
                        Klik <strong>"Kirim Request"</strong> untuk menjalankan pengujian pada server {serverTarget}.
                      </p>
                    </div>
                  {/if}
                </div>

                <!-- Sample Response Section below Response Body -->
                {#if selectedEndpoint.sampleResponse}
                  <div class="space-y-2 pt-3 border-t border-base-300">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold text-base-content/70 flex items-center gap-1.5">
                        <iconify-icon icon="solar:document-text-bold" class="text-primary"></iconify-icon>
                        Contoh Format Respon (Sample Response):
                      </span>
                      <button
                        class="btn btn-ghost btn-xs gap-1"
                        onclick={() => copyText(JSON.stringify(selectedEndpoint.sampleResponse, null, 2))}
                      >
                        <iconify-icon icon="solar:copy-outline"></iconify-icon>
                        Salin Sample
                      </button>
                    </div>
                    <pre
                      class="font-mono text-[11px] bg-base-200/60 p-3.5 rounded-box border border-base-300 overflow-x-auto leading-relaxed select-all text-base-content/80">{JSON.stringify(
                        selectedEndpoint.sampleResponse,
                        null,
                        2
                      )}</pre>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="h-full flex items-center justify-center text-base-content/40 text-xs">
          Pilih endpoint dari menu sebelah kiri
        </div>
      {/if}
    </main>
  </div>
</div>

<!-- Modal Base64 Converter Tool -->
{#if showToolModal}
  <div class="modal modal-open">
    <div class="modal-box max-w-2xl border border-base-300 shadow-xl space-y-4">
      <div class="flex items-center justify-between border-b border-base-200 pb-3">
        <h3 class="font-bold text-base flex items-center gap-2">
          <iconify-icon icon="solar:refresh-square-outline" class="text-primary text-xl"></iconify-icon>
          Tool Konversi Base64 (PDF & Spesimen TTD)
        </h3>
        <button
          class="btn btn-sm btn-circle btn-ghost"
          onclick={() => (showToolModal = false)}
        >✕</button>
      </div>

      <div class="join w-full">
        <button
          class="join-item btn btn-sm flex-1 {convertMode === 'encode' ? 'btn-primary' : 'btn-ghost border-base-300'}"
          onclick={() => (convertMode = "encode")}
        >
          File PDF / Gambar &rarr; Base64
        </button>
        <button
          class="join-item btn btn-sm flex-1 {convertMode === 'decode' ? 'btn-primary' : 'btn-ghost border-base-300'}"
          onclick={() => (convertMode = "decode")}
        >
          Base64 &rarr; Preview Dokumen
        </button>
      </div>

      {#if convertMode === "encode"}
        <div class="space-y-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold text-base-content/70">
              Pilih file dokumen PDF atau gambar (PNG/JPG spesimen TTD):
            </label>
            <input
              type="file"
              accept=".pdf,image/*"
              class="file-input file-input-bordered file-input-sm w-full font-mono text-xs"
              onchange={handleEncodeFile}
            />
          </div>

          {#if encodedBase64}
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-medium text-base-content/70">
                  Hasil Base64 ({encodedMime}) - {encodedBase64.length} karakter:
                </span>
                <button
                  class="btn btn-xs btn-primary gap-1"
                  onclick={() => copyText(encodedBase64)}
                >
                  <iconify-icon icon="solar:copy-outline"></iconify-icon>
                  Salin Base64
                </button>
              </div>
              <textarea
                class="textarea textarea-bordered font-mono text-[10px] w-full h-40 select-all leading-tight bg-base-100"
                readonly
                value={encodedBase64}
              ></textarea>
            </div>
          {/if}
        </div>
      {:else}
        <div class="space-y-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold text-base-content/70">
              Tempelkan string Base64 (PDF atau Gambar):
            </label>
            <textarea
              class="textarea textarea-bordered font-mono text-[10px] w-full h-28 bg-base-100"
              placeholder="Tempel string base64 di sini..."
              bind:value={decodeInputBase64}
            ></textarea>
          </div>

          <button
            class="btn btn-sm btn-neutral w-full gap-2"
            onclick={handleDecode}
            disabled={!decodeInputBase64.trim()}
          >
            <iconify-icon icon="solar:eye-outline" class="text-base"></iconify-icon>
            Pratinjau Dokumen
          </button>

          {#if decodedBlobUrl}
            <div class="pt-2 border-t border-base-200 space-y-2">
              <div class="flex items-center justify-between text-xs font-medium">
                <span>Hasil Pratinjau ({decodedType.toUpperCase()}):</span>
                <a
                  href={decodedBlobUrl}
                  download={`dokumen-hasil.${decodedType === 'pdf' ? 'pdf' : 'png'}`}
                  class="btn btn-xs btn-outline gap-1"
                >
                  <iconify-icon icon="solar:download-square-outline"></iconify-icon>
                  Unduh File
                </a>
              </div>
              {#if decodedType === "pdf"}
                <iframe
                  src={decodedBlobUrl}
                  title="PDF Preview"
                  class="w-full h-72 rounded-box border border-base-300"
                ></iframe>
              {:else}
                <div class="p-4 bg-base-200/50 rounded-box border border-base-300 flex items-center justify-center">
                  <img
                    src={decodedBlobUrl}
                    alt="Preview"
                    class="max-h-56 object-contain rounded-box shadow-xs"
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <div class="modal-action border-t border-base-200 pt-3">
        <button class="btn btn-sm" onclick={() => (showToolModal = false)}>Tutup</button>
      </div>
    </div>
  </div>
{/if}
