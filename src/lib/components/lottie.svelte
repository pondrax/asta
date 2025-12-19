<script lang="ts">
  import lottie from "lottie-web";
  import { app } from "$lib/app/index.svelte";

  let { url, loop, autoplay } = $props();

  let container: HTMLElement | null = $state(null);
  $effect(() => {
    render();
  });

  $effect(() => {
    if (app.theme) {
      setTheme(app.theme);
    }
  });

  async function render() {
    if (!container) return;
    const img = await fetch(url).then((res) => res.json());
    lottie.loadAnimation({
      container,
      animationData: img,
      renderer: "svg",
      loop,
      autoplay,
    });

    setTheme(app.theme);
  }

  function setTheme(theme: string) {
    const lottie = document.querySelectorAll(".lottie-svg");
    if (!lottie) return;
    lottie.forEach((el) => {
      el.querySelectorAll("[stroke]").forEach((el) => {
        el.setAttribute("stroke", theme === "dark" ? "#fff" : "#000");
      });
      el.querySelectorAll("[fill]").forEach((el) => {
        el.setAttribute("fill", theme === "dark" ? "#fff" : "#000");
      });
    });
  }
</script>

<div bind:this={container} class="lottie-svg"></div>

<style>
  .lottie-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
