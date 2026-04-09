<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade, scale } from "svelte/transition";

  interface Step {
    target: string;
    title: string;
    content: string;
    placement?: "top" | "bottom" | "left" | "right" | "center";
    onShow?: () => void;
  }

  let {
    steps = [],
    onComplete = () => {},
    onSkip = () => {},
  }: {
    steps: Step[];
    onComplete?: () => void;
    onSkip?: () => void;
  } = $props();

  let currentStep = $state(0);
  let isVisible = $state(false);
  let rect = $state({ top: 0, left: 0, width: 0, height: 0 });
  let windowSize = $state({ width: 0, height: 0 });

  const activeStep = $derived(steps[currentStep]);

  // Calculate card position and arrow direction
  let cardPos = $state({ top: 0, left: 0, placement: "bottom" });

  function updateRect() {
    if (!activeStep) return;
    const el = document.querySelector(activeStep.target);
    if (el) {
      const r = el.getBoundingClientRect();
      rect = {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      };

      // Scroll into view if needed
      if (currentStep > 0) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      // Calculate placement
      const margin = 24;
      const cardWidth = 320;
      const cardHeight = 240; // Estimated max height

      let top = r.top + r.height + margin;
      let left = r.left + r.width / 2;
      let placement = activeStep.placement || "bottom";

      // If bottom doesn't fit, try top (unless forced)
      if (!activeStep.placement && top + cardHeight > windowSize.height) {
        if (r.top - cardHeight - margin > 0) {
          top = r.top - cardHeight - margin;
          placement = "top";
        } else {
          // Center as fallback
          top = windowSize.height / 2;
          left = windowSize.width / 2;
          placement = "center";
        }
      }

      // Handle forced placements
      if (activeStep.placement === "top") {
        top = r.top - cardHeight - margin;
      } else if (activeStep.placement === "bottom") {
        top = r.top + r.height + margin;
      }

      // Keep within horizontal bounds
      left = Math.max(
        cardWidth / 2 + 20,
        Math.min(windowSize.width - cardWidth / 2 - 20, left),
      );

      cardPos = { top, left, placement };
    } else {
      rect = { top: 0, left: 0, width: 0, height: 0 };
      cardPos = {
        top: windowSize.height / 2,
        left: windowSize.width / 2,
        placement: "center",
      };
    }
  }

  $effect(() => {
    if (isVisible) {
      updateRect();
    }
  });

  $effect(() => {
    // Re-calculate on step change
    const target = activeStep?.target;
    if (!target) return;

    if (activeStep?.onShow) {
      activeStep.onShow();
    }

    const observer = new ResizeObserver(() => {
      updateRect();
    });

    const checkInterval = setInterval(() => {
      const el = document.querySelector(target);
      if (el) {
        observer.observe(el);
        clearInterval(checkInterval);
        updateRect();
      }
    }, 50);

    tick().then(updateRect);

    return () => {
      observer.disconnect();
      clearInterval(checkInterval);
    };
  });

  onMount(() => {
    windowSize = { width: window.innerWidth, height: window.innerHeight };
    const handleResize = () => {
      windowSize = { width: window.innerWidth, height: window.innerHeight };
      updateRect();
    };
    window.addEventListener("resize", handleResize);

    setTimeout(() => (isVisible = true), 500);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  const next = () => {
    if (currentStep < steps.length - 1) {
      currentStep++;
    } else {
      isVisible = false;
      onComplete();
    }
  };

  const back = () => {
    if (currentStep > 0) {
      currentStep--;
    }
  };

  const skip = () => {
    isVisible = false;
    onSkip();
  };

  const cardStyle = $derived(() => {
    if (cardPos.placement === "center") {
      return "top: 50%; left: 50%; transform: translate(-50%, -50%);";
    }
    return `top: ${cardPos.top}px; left: ${cardPos.left}px; transform: translate(-50%, 0);`;
  });
</script>

{#if isVisible && activeStep}
  <div class="fixed inset-0 z-[9999] overflow-hidden pointer-events-none">
    <!-- Backdrop with 4-way blocking to allow interaction with target -->
    <div class="absolute inset-0 pointer-events-none">
      <!-- Top -->
      <div
        class="absolute top-0 left-0 w-full bg-black/70 backdrop-blur-[2px] pointer-events-auto"
        style="height: {rect.top}px;"
        onclick={skip}
      ></div>
      <!-- Bottom -->
      <div
        class="absolute bottom-0 left-0 w-full bg-black/70 backdrop-blur-[2px] pointer-events-auto"
        style="top: {rect.top + rect.height}px;"
        onclick={skip}
      ></div>
      <!-- Left -->
      <div
        class="absolute left-0 bg-black/70 backdrop-blur-[2px] pointer-events-auto"
        style="top: {rect.top}px; height: {rect.height}px; width: {rect.left}px;"
        onclick={skip}
      ></div>
      <!-- Right -->
      <div
        class="absolute right-0 bg-black/70 backdrop-blur-[2px] pointer-events-auto"
        style="top: {rect.top}px; height: {rect.height}px; left: {rect.left +
          rect.width}px;"
        onclick={skip}
      ></div>
    </div>

    <!-- Tour Card -->
    <div
      class="absolute pointer-events-auto transition-all duration-500 ease-in-out"
      style={cardStyle()}
      in:scale={{ duration: 300, start: 0.9 }}
    >
      <div class="card w-80 bg-base-100 shadow-2xl border border-primary/20">
        <div class="card-body p-5">
          <div class="flex justify-between items-center mb-2">
            <h2 class="card-title text-primary text-lg">
              {activeStep.title}
            </h2>
            <span class="badge badge-sm badge-outline opacity-50">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <p class="text-sm opacity-80 leading-relaxed">
            {activeStep.content}
          </p>
          <div class="card-actions justify-between mt-6 items-center">
            <button class="btn btn-ghost btn-xs text-error" onclick={skip}>
              Skip
            </button>
            <div class="flex gap-2">
              {#if currentStep > 0}
                <button class="btn btn-sm btn-outline" onclick={back}>
                  Back
                </button>
              {/if}
              <button class="btn btn-sm btn-primary" onclick={next}>
                {currentStep === steps.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>

        <!-- Arrow Pointer -->
        {#if cardPos.placement === "bottom"}
          <div
            class="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-base-100 rotate-45 border-l border-t border-primary/20"
          ></div>
        {:else if cardPos.placement === "top"}
          <div
            class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-base-100 rotate-45 border-r border-b border-primary/20"
          ></div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Optional: Pulsing effect on the target highlight area */
  /* This actually needs complex CSS or SVG animation on the mask rect */
</style>
