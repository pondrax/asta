<script lang="ts">
  import { marked } from "marked";
  import { sendMessage } from "$lib/remotes/chat.remote";

  const render = (text: string) => marked.parse(text) as string;

  let open = $state(false);
  let messages = $state<{ role: "user" | "assistant"; content: string }[]>([]);
  let input = $state("");
  let loading = $state(false);

  let chatbox = $state() as HTMLDivElement | undefined;

  $effect(() => {
    if (open && chatbox) {
      requestAnimationFrame(() => {
        chatbox!.scrollTop = chatbox!.scrollHeight;
      });
    }
  });

  function toggle() {
    open = !open;
    if (open && messages.length === 0) {
      messages = [
        {
          role: "assistant",
          content: "Halo! Ada yang bisa saya bantu terkait layanan Tapak Astà?",
        },
      ];
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    input = "";
    messages = [...messages, { role: "user", content: text }];
    loading = true;
    try {
      const result = await sendMessage({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      messages = [...messages, { role: "assistant", content: result.content }];
    } catch {
      messages = [
        ...messages,
        {
          role: "assistant",
          content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
        },
      ];
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

{#if open}
  <div
    class="fixed bottom-[140px] right-4 z-50 w-80 sm:w-96 shadow-2xl rounded-box bg-base-100 border border-base-300 flex flex-col overflow-hidden"
  >
    <div
      class="flex items-center justify-between px-4 py-3 bg-primary text-primary-content"
    >
      <span class="font-semibold text-sm flex items-center gap-2">
        <iconify-icon icon="bx:bot"></iconify-icon>
        Asisten AI
      </span>
      <button
        class="btn btn-ghost btn-xs btn-circle text-primary-content"
        onclick={toggle}
        aria-label="Tutup"
      >
        <iconify-icon icon="bx:x"></iconify-icon>
      </button>
    </div>

    <div
      bind:this={chatbox}
      class="flex-1 overflow-y-auto p-3 space-y-3 min-h-72 max-h-96"
    >
      {#each messages as msg, i (msg.role + i)}
        <div class="chat {msg.role === 'user' ? 'chat-end' : 'chat-start'}">
          <div
            class="chat-bubble text-xs {msg.role === 'user'
              ? 'chat-bubble-primary'
              : 'chat-bubble-ghost bg-base-200'}"
          >
            {@html render(msg.content)}
          </div>
        </div>
      {/each}
      {#if loading}
        <div class="chat chat-start">
          <div class="chat-bubble chat-bubble-ghost bg-base-200 text-xs">
            <span class="loading loading-dots loading-xs"></span>
          </div>
        </div>
      {/if}
    </div>

    <div class="border-t border-base-300 p-3 flex gap-2">
      <input
        type="text"
        bind:value={input}
        onkeydown={handleKeydown}
        placeholder="Ketik pesan..."
        class="input input-bordered input-sm flex-1"
        disabled={loading}
      />
      <button
        class="btn btn-primary btn-sm"
        onclick={send}
        disabled={loading || !input.trim()}
        aria-label="Kirim"
      >
        <iconify-icon icon="bx:send"></iconify-icon>
      </button>
    </div>
  </div>
{/if}

<button
  class="btn btn-success btn-circle btn-lg shadow-lg fixed right-4 z-50 bottom-18 animate-pulse"
  onclick={toggle}
  aria-label="Chat"
>
  <iconify-icon icon={open ? "bx:x" : "bx:bot"} class="text-xl"></iconify-icon>
</button>
