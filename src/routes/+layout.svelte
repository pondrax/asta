<script lang="ts">
	import "iconify-icon";
	import "../app.css";
	import { app } from "$lib/app/index.svelte";
	import { onMount } from "svelte";

	let { children } = $props();

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

<!-- <svelte:head>
	<link rel="icon" href="/favicon.ico" />
</svelte:head> -->

{@render children()}
