<script>
  import Eye from "./eye.svelte";
  let { closeeye = false } = $props();
</script>

<div class="relative w-22 transition-transform duration-500">
  <img
    src="/ava-flip.svg"
    alt="Avatar"
    class="w-22 scale-x-[-1] transition-all duration-300"
  />
  <div
    class="absolute flex items-center gap-5 justify-center top-4 bottom-0 -right-1 w-full scale-50"
  >
    <Eye {closeeye} />
    <Eye {closeeye} />
  </div>
</div>
