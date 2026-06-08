<script lang="ts">
	import "iconify-icon";
	import "../app.css";
	import { app } from "$lib/app/index.svelte";
	import { onMount } from "svelte";

	let { children, data } = $props();

	onMount(async () => {
		app.theme = localStorage.theme || "light";
	});
	$effect(() => {
		if (app.theme) {
			document.documentElement.dataset.theme = app.theme;
			localStorage.theme = app.theme;
		}
	});
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
  {#each app.toasts as toast (toast.id)}
    <div
      class="alert {toast.type === 'success'
        ? 'alert-success'
        : 'alert-error'} py-2 px-4 shadow-xl text-xs font-semibold"
    >
      <iconify-icon
        icon={toast.type === "success"
          ? "bx:check-circle"
          : "bx:error-circle"}
      ></iconify-icon>
      <span>{toast.message}</span>
    </div>
  {/each}
</div>
