<script lang="ts" generics="T">
  import type { Snippet } from "svelte";

  let el = $state();
  type Props = {
    children?: Snippet<[T]>;
    action?: Snippet<[T]>;
    title?: string;
    data?: T;
    size?: "sm" | "md" | "lg" | "xl";
    closeable?: boolean;
    onClose?: () => void;
  };
  let {
    children,
    action,
    title,
    data = $bindable(),
    size = "md",
    closeable = true,
    onClose,
  }: Props = $props();

  function handleClose(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (closeable) {
        data = undefined;
      }
    }
  }

  $effect(() => {
    if (!size) {
      size = "md";
    }
    const toast = document.querySelector("#main-toast") as HTMLElement;
    const dialog = el as HTMLDialogElement;
    if (data && dialog) {
      // Guard: a dialog that survived teardown with a lingering `open`
      // attribute (or was opened non-modally) cannot be re-opened with
      // showModal() — reset it first.
      if (!dialog.open) dialog.showModal();
      if (toast) dialog.appendChild(toast);
      const focusElement = document.querySelector("[data-autofocus]");
      if (focusElement instanceof HTMLInputElement) {
        setTimeout(() => focusElement.focus(), 100);
      }
    }
    return () => {
      // Reset any lingering open state so a later showModal() doesn't throw.
      if (dialog?.open) {
        try {
          dialog.close();
        } catch {}
      }
      if (toast) document.body.appendChild(toast);
    };
  });
</script>

<svelte:window onkeydown={handleClose} />

{#if data}
  <dialog bind:this={el} class="modal modal-open">
    <div
      class="modal-box relative w-11/12 flex flex-col overflow-visible"
      class:max-w-md={size == "sm"}
      class:max-w-xl={size == "md"}
      class:max-w-2xl={size == "lg"}
      class:max-w-7xl={size == "xl"}
    >
      {#if closeable}
        <form method="dialog">
          <button
            class="btn btn-sm btn-circle btn-ghost absolute top-4 right-2 z-20"
            onclick={() => {
              onClose?.();
              data = undefined;
            }}
          >
            ✕
          </button>
        </form>
      {/if}
      <h3 class="text-lg font-bold sticky">{title}</h3>
      <div class="flex-1 px-1 py-2">
        {@render children?.(data)}
      </div>
      <div class="modal-action mt-0 justify-start p-0">
        {@render action?.(data)}
      </div>
    </div>
  </dialog>
{/if}
