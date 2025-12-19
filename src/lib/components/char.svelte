<script>
  import Eye from "./eye.svelte";
</script>

<div class="relative w-40 hover:translate-y-8 transition-transform">
  <img src="/ava-flip.svg" alt="Avatar" class="w-40" />
  <div
    class="absolute flex items-center gap-5 justify-center top-6 bottom-0 w-full"
  >
    <Eye />
    <Eye />
  </div>
</div>
