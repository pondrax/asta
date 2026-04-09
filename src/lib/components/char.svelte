<script>
  import Eye from "./eye.svelte";
  let { closeeye = false } = $props();
</script>

<div
  class="relative w-40 translate-y-8 hover:translate-y-20 transition-transform duration-500 -mt-20"
>
  <img src="/ava-flip.svg" alt="Avatar" class="w-40" />
  <div
    class="absolute flex items-center gap-5 justify-center top-8 bottom-0 -left-1 w-full"
  >
    <Eye {closeeye} />
    <Eye {closeeye} />
  </div>
</div>
