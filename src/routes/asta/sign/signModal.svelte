<script lang="ts">
  let { data = $bindable(undefined) } = $props();
</script>

{#if data}
  <dialog class="modal" open>
    <div class="modal-box">
      <button
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        onclick={() => (data = undefined)}
      >
        ✕
      </button>
      <h3 class="text-lg font-bold">Hello!</h3>
      <p class="py-4">Press ESC key or click on ✕ button to close</p>
    </div>
  </dialog>
{/if}
