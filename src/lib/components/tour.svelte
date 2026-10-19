<script lang="ts">
  import { onMount, tick } from "svelte";
  import { scale } from "svelte/transition";

  interface Step {
    target: string;
    title: string;
    content: string;
    placement?: "top" | "bottom" | "left" | "right" | "center";
    onShow?: () => void;
    /** The step lives in (or opens) a dialog; keep re-placing the overlay. */
    modal?: boolean;
    /** The step's target must be clickable through the overlay. */
    interactive?: boolean;
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
  let windowSize = $state({ w: 0, h: 0 });
  let cardHeight = $state(240);

  const activeStep = $derived(steps[currentStep]);

  let cardPos = $state({ top: 0, left: 0, placement: "bottom" });

  let container = $state<HTMLElement>();

  const PAD = 8;
  const R = 12;

  /**
   * First *visible* match for a selector. Responsive layouts render the same id
   * in more than one place (e.g. one hidden per breakpoint), so plain
   * querySelector can land on a zero-size element.
   */
  function findTarget(selector: string): Element | null {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return els[0] ?? null;
  }

  /** The overlay's original parent, so we can move it back after a dialog. */
  let homeParent: HTMLElement | null = null;

  /**
   * Mount the overlay inside the open `<dialog>` containing the current target
   * (if any). A popover/overlay above a modal dialog is inert, but a *descendant*
   * of the dialog is not — this is what keeps the tour visible above, and lets
   * the passphrase field be clicked, while the sign dialog is open.
   */
  function placeOverlay() {
    const el = container;
    if (!el) return;
    if (!homeParent) homeParent = el.parentElement ?? document.body;

    const target = activeStep ? findTarget(activeStep.target) : null;
    const dialog = target?.closest("dialog") as HTMLDialogElement | null;
    const parent = dialog?.open ? dialog : (homeParent ?? document.body);
    if (el.parentElement !== parent) parent.appendChild(el);
  }

  function updateRect() {
    if (!activeStep) return;
    const el = findTarget(activeStep.target);
    if (el) {
      const r = el.getBoundingClientRect();
      rect = { top: r.top, left: r.left, width: r.width, height: r.height };

      const gap = 28;
      const cardWidth = 320;
      let top = 0;
      let left = 0;
      let placement = activeStep.placement || "bottom";

      let prefer = activeStep.placement || "bottom";

      if (prefer === "center") {
        top = windowSize.h / 2;
        left = windowSize.w / 2;
        placement = "center";
      } else if (prefer === "top") {
        top = r.top - cardHeight - gap;
        left = r.left + r.width / 2;
        placement = "top";
        if (top < 0) { prefer = "bottom"; }
      } else if (prefer === "bottom") {
        top = r.bottom + gap;
        left = r.left + r.width / 2;
        placement = "bottom";
        if (top + cardHeight > windowSize.h) { prefer = "top"; }
      } else if (prefer === "left") {
        top = r.top + r.height / 2;
        left = r.left - cardWidth / 2 - gap;
        placement = "left";
        if (left < cardWidth / 2 + gap) { prefer = "right"; }
      } else if (prefer === "right") {
        top = r.top + r.height / 2;
        left = r.right + cardWidth / 2 + gap;
        placement = "right";
        if (left + cardWidth / 2 + gap > windowSize.w) { prefer = "left"; }
      }

      if (prefer !== "center" && prefer !== placement) {
        if (prefer === "top") {
          top = r.top - cardHeight - gap;
          placement = "top";
        } else if (prefer === "bottom") {
          top = r.bottom + gap;
          placement = "bottom";
        } else if (prefer === "left") {
          top = r.top + r.height / 2;
          left = r.left - cardWidth / 2 - gap;
          placement = "left";
        } else if (prefer === "right") {
          top = r.top + r.height / 2;
          left = r.right + cardWidth / 2 + gap;
          placement = "right";
        }
        if (
          (placement === "top" && top < 0) ||
          (placement === "bottom" && top + cardHeight > windowSize.h)
        ) {
          top = windowSize.h / 2;
          left = windowSize.w / 2;
          placement = "center";
        }
      }

      const halfCard = cardWidth / 2;
      const cl = halfCard + 12;
      top = Math.max(12, Math.min(windowSize.h - cardHeight - 12, top));
      left = Math.max(cl, Math.min(windowSize.w - cl, left));
      cardPos = { top, left, placement };
    } else {
      rect = { top: 0, left: 0, width: 0, height: 0 };
      cardPos = { top: windowSize.h / 2, left: windowSize.w / 2, placement: "center" };
    }
  }

  /**
   * Collect all scrollable ancestor elements for a given element.
   * We need to listen to scroll events on each so the tooltip repositions.
   */
  function getScrollParents(el: Element): Element[] {
    const parents: Element[] = [];
    let cur: Element | null = el.parentElement;
    while (cur && cur !== document.documentElement) {
      const style = window.getComputedStyle(cur);
      const overflow = style.overflow + style.overflowY + style.overflowX;
      if (/auto|scroll/.test(overflow)) parents.push(cur);
      cur = cur.parentElement;
    }
    // always add window scroll too
    return parents;
  }

  $effect(() => {
    const target = activeStep?.target;
    if (!target) return;
    if (activeStep?.onShow) activeStep.onShow();
    // The step may open its dialog asynchronously, so re-place the overlay once
    // the modal has mounted. Moving it inside the dialog keeps it interactive.
    setTimeout(placeOverlay, 0);
    setTimeout(placeOverlay, 60);
    if (activeStep?.modal) {
      setTimeout(placeOverlay, 400);
      setTimeout(placeOverlay, 1000);
    }

    let scrollListeners: { el: Element | Window; fn: () => void }[] = [];
    const removeScrollListeners = () => {
      for (const { el, fn } of scrollListeners) {
        el.removeEventListener("scroll", fn);
      }
      scrollListeners = [];
    };

    const observer = new ResizeObserver(() => updateRect());
    const check = setInterval(() => {
      const el = findTarget(target);
      if (el) {
        observer.observe(el);
        clearInterval(check);

        // Scroll into view, then re-run updateRect once scroll animation settles
        if (currentStep > 0) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Wait for smooth scroll to finish (typically ~500ms) then recalculate
          setTimeout(() => updateRect(), 550);
        }

        // Listen on all scrollable parents
        removeScrollListeners();
        const parents = getScrollParents(el);
        for (const parent of parents) {
          const fn = () => updateRect();
          parent.addEventListener("scroll", fn, { passive: true });
          scrollListeners.push({ el: parent, fn });
        }
        // Also window scroll
        const winFn = () => updateRect();
        window.addEventListener("scroll", winFn, { passive: true });
        scrollListeners.push({ el: window, fn: winFn });

        updateRect();
      }
    }, 50);
    tick().then(updateRect);
    return () => {
      observer.disconnect();
      clearInterval(check);
      removeScrollListeners();
    };
  });

  onMount(() => {
    windowSize = { w: window.innerWidth, h: window.innerHeight };
    const h = () => {
      windowSize = { w: window.innerWidth, h: window.innerHeight };
      updateRect();
    };
    window.addEventListener("resize", h);
    setTimeout(() => (isVisible = true), 500);
    return () => window.removeEventListener("resize", h);
  });

  // When any dialog opens/closes (e.g. the sign modal), re-place the overlay so
  // it moves into/out of the dialog. Watching `open` + child list catches
  // dialogs mounted or removed at any time.
  $effect(() => {
    if (!isVisible) return;
    const observer = new MutationObserver(() => {
      requestAnimationFrame(placeOverlay);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      childList: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  });

  const next = () => {
    if (currentStep < steps.length - 1) currentStep++;
    else { isVisible = false; onComplete(); }
  };

  const back = () => { if (currentStep > 0) currentStep--; };
  const skip = () => { isVisible = false; onSkip(); };

  const cardStyle = $derived.by(() => {
    if (cardPos.placement === "center") return "top: 50%; left: 50%; transform: translate(-50%, -50%);";
    return `top: ${cardPos.top}px; left: ${cardPos.left}px; transform: translate(-50%, 0);`;
  });

  const hx = $derived(rect.left - PAD);
  const hy = $derived(rect.top - PAD);
  const hw = $derived(rect.width + PAD * 2);
  const hh = $derived(rect.height + PAD * 2);
</script>

{#if isVisible && activeStep}
  <div
    bind:this={container}
    class="fixed inset-0 z-[9999] pointer-events-none m-0 p-0 border-0 bg-transparent w-screen h-screen max-w-none max-h-none overflow-visible"
  >
    <svg
      class="fixed inset-0 {activeStep.interactive
        ? 'pointer-events-none'
        : 'pointer-events-auto'}"
      style="width: 100vw; height: 100vh; cursor: auto;"
      onclick={skip}
      onkeydown={(e) => e.key === 'Escape' && skip()}
      role="button"
      tabindex="-1"
    >
      <defs>
        <mask id="tour-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={hx} y={hy} width={hw} height={hh} rx={R} ry={R} fill="black" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#tour-mask)" />
      <rect
        x={hx - 1} y={hy - 1} width={hw + 2} height={hh + 2}
        rx={R + 1} ry={R + 1}
        fill="none" stroke="oklch(var(--p))" stroke-width="3"
        class="animate-tour-pulse"
      />
    </svg>

    <div
      class="absolute transition-all duration-500 ease-in-out {activeStep.interactive
        ? 'pointer-events-none'
        : 'pointer-events-auto'}"
      style={cardStyle}
      in:scale={{ duration: 300, start: 0.9 }}
    >
      <div class="card w-80 bg-base-100 shadow-2xl border border-primary/20" bind:clientHeight={cardHeight}>
        <div class="card-body p-5">
          <div class="flex justify-between items-center mb-2">
            <h2 class="card-title text-primary text-lg">{activeStep.title}</h2>
            <span class="badge badge-sm badge-outline opacity-50 whitespace-nowrap shrink-0">{currentStep + 1} / {steps.length}</span>
          </div>
          <p class="text-sm opacity-80 leading-relaxed">{activeStep.content}</p>
          <div class="card-actions justify-between mt-6 items-center">
            <button
              type="button"
              class="btn btn-ghost btn-xs text-error pointer-events-auto"
              onclick={skip}
            >
              Skip
            </button>
            <div class="flex gap-2">
              {#if currentStep > 0}
                <button
                  type="button"
                  class="btn btn-sm btn-outline pointer-events-auto"
                  onclick={back}
                >
                  Back
                </button>
              {/if}
              <button
                type="button"
                class="btn btn-sm btn-primary pointer-events-auto"
                onclick={next}
              >
                {currentStep === steps.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>

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
  @keyframes tour-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  :global(.animate-tour-pulse) {
    animation: tour-pulse 2s ease-in-out infinite;
  }
</style>
