<script lang="ts">
  let eye: HTMLElement | null = $state(null);
  let pupil: HTMLElement | null = $state(null);

  function followMouse(event: MouseEvent) {
    if (!eye || !pupil) return;

    const rect = eye.getBoundingClientRect();
    const eyeX = rect.left + rect.width / 2;
    const eyeY = rect.top + rect.height / 2;

    const dx = event.clientX - eyeX;
    const dy = event.clientY - eyeY;

    const angle = Math.atan2(dy, dx);
    const radius = 5; // how far the pupil can move

    pupil.style.transform = `
      translate(
        ${Math.cos(angle) * radius}px,
        ${Math.sin(angle) * radius}px
      )
    `;
  }
</script>

<svelte:window on:mousemove={followMouse} />

<div class="eye" bind:this={eye}>
  <div class="pupil" bind:this={pupil}></div>
</div>

<style>
  .eye {
    width: 20px;
    height: 20px;
    /* background: white; */
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* border: 2px solid black; */

  .pupil {
    width: 8px;
    height: 8px;
    background: black;
    border-radius: 50%;
    transition: transform 0.05s linear;
  }
</style>
