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
      const history = () =>
        messages.map((m) => ({ role: m.role, content: m.content }));
      let result = await sendMessage({ messages: history() });
      let fullContent = result.content;
      while (result.finish_reason === "length") {
        result = await sendMessage({
          messages: [
            ...history(),
            { role: "assistant", content: fullContent },
            { role: "user", content: "Lanjutkan" },
          ],
        });
        fullContent += "\n\n" + result.content;
      }
      const chunks = fullContent.split(/\n\n+/).filter(Boolean);
      messages = [
        ...messages,
        ...chunks.map((c: any) => ({ role: "assistant" as const, content: c })),
      ];
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
            class="chat-bubble {msg.role === 'user'
              ? 'chat-bubble-primary'
              : 'chat-bubble-ghost bg-base-200'} chat-md"
          >
            {#if msg.role === "user"}
              {msg.content}
            {:else}
              {@html render(msg.content)}
            {/if}
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

<style>
  .chat-md {
    font-size: 0.75rem;
    line-height: 1.5;
  }
  .chat-md p {
    margin: 0.5rem 0;
  }
  .chat-md p:first-child {
    margin-top: 0;
  }
  .chat-md p:last-child {
    margin-bottom: 0;
  }
  .chat-md h1 {
    font-size: 1.125rem;
    font-weight: 700;
    margin: 0.75rem 0 0.375rem;
  }
  .chat-md h2 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0.75rem 0 0.375rem;
  }
  .chat-md h3 {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0.625rem 0 0.375rem;
  }
  .chat-md h4 {
    font-size: 0.8125rem;
    font-weight: 600;
    margin: 0.625rem 0 0.375rem;
  }
  .chat-md ul,
  .chat-md ol {
    padding-left: 1.25rem;
    margin: 0.5rem 0;
  }
  .chat-md li {
    margin: 0.25rem 0;
  }
  .chat-md li::marker {
    color: oklch(var(--p));
  }
  .chat-md code {
    background: oklch(var(--b3));
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    font-family: monospace;
  }
  .chat-md pre {
    background: oklch(var(--b3));
    padding: 0.5rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }
  .chat-md pre code {
    background: none;
    padding: 0;
    border-radius: 0;
  }
  .chat-md blockquote {
    border-left: 3px solid oklch(var(--p));
    padding-left: 0.5rem;
    margin: 0.5rem 0;
    opacity: 0.85;
  }
  .chat-md a {
    color: oklch(var(--p));
    text-decoration: underline;
  }
  .chat-md strong {
    font-weight: 700;
  }
  .chat-md hr {
    border: none;
    border-top: 1px solid oklch(var(--b3));
    margin: 0.75rem 0;
  }
</style>
