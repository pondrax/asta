<script lang="ts">
  import lottie from "lottie-web";
  import { app } from "$lib/app/index.svelte";

  /**
   * `monochrome` recolours the animation to match the app theme, which is what
   * the wordmark needs. Set it to `false` for animations that carry their own
   * colours (the error robot, for example).
   */
  let {
    url,
    loop,
    autoplay,
    monochrome = true,
    onerror,
  }: {
    url: string;
    loop?: boolean;
    autoplay?: boolean;
    monochrome?: boolean;
    onerror?: () => void;
  } = $props();

  let container: HTMLElement | null = $state(null);
  let animation: ReturnType<typeof lottie.loadAnimation> | undefined;
  let renderId = 0;

  $effect(() => {
    render();
  });

  $effect(() => {
    if (app.theme) {
      setTheme(app.theme);
    }
  });

  async function render() {
    const id = ++renderId;

    animation?.destroy();
    animation = undefined;
    if (!container) return;

    let data: Record<string, unknown>;
    try {
      data = await fetch(url).then((res) => res.json());
    } catch {
      // A missing animation must not take the page down with it.
      onerror?.();
      return;
    }

    // A newer render started while the animation was loading.
    if (id !== renderId || !container) return;

    animation = lottie.loadAnimation({
      container,
      animationData: data,
      renderer: "svg",
      loop,
      autoplay,
    });

    setTheme(app.theme);
  }

  function setTheme(theme: string) {
    if (!monochrome || !container) return;
    container.querySelectorAll("[stroke]").forEach((el) => {
      el.setAttribute("stroke", theme === "dark" ? "#fff" : "#000");
    });
    container.querySelectorAll("[fill]").forEach((el) => {
      el.setAttribute("fill", theme === "dark" ? "#fff" : "#000");
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
