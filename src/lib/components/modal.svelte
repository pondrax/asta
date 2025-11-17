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
    if (data) {
      dialog.showModal();
      if (toast) dialog.appendChild(toast);
      const focusElement = document.querySelector("[data-autofocus]");
      if (focusElement instanceof HTMLInputElement) {
        setTimeout(() => focusElement.focus(), 100);
      }
    }
    return () => {
      if (toast) document.body.appendChild(toast);
    };
  });
</script>

<svelte:window onkeydown={handleClose} />

{#if data}
  <dialog bind:this={el} class="modal modal-open">
    <div
      class="modal-box relative w-11/12"
      class:max-w-md={size == "sm"}
      class:max-w-xl={size == "md"}
      class:max-w-4xl={size == "lg"}
      class:max-w-7xl={size == "xl"}
    >
      {#if closeable}
        <form method="dialog">
          <button
            class="btn btn-sm btn-circle btn-ghost absolute top-4 right-2"
            onclick={() => {
              onClose?.();
              data = undefined;
            }}
          >
            ✕
          </button>
        </form>
      {/if}
      <h3 class="text-lg font-bold">{title}</h3>
      {@render children?.(data)}
      <div class="modal-action mt-0 justify-start p-0">
        {@render action?.(data)}
      </div>
    </div>
  </dialog>
{/if}
