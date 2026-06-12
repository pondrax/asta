<script lang="ts">
  import { marked } from "marked";
  import { sendMessage } from "$lib/remotes/chat.remote";
  import Char from "./char.svelte";
  import { app } from "$lib/app/index.svelte";

  const render = (text: string) => marked.parse(text) as string;

  let open = $state(false);
  let messages = $state<{ role: "user" | "assistant"; content: string }[]>([]);
  let input = $state("");
  let loading = $state(false);

  let chatbox = $state() as HTMLDivElement | undefined;
  let showEmoji = $state(false);

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
    class="fixed bottom-18 right-4 z-50 w-80 sm:w-96 shadow-2xl rounded-box bg-base-100 border border-base-300 flex flex-col overflow-hidden"
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
              : 'chat-bubble-ghost bg-base-200'} chat-sm"
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

    <div class="border-t border-base-300 p-3 flex gap-2 relative items-center">
      <label class="input input-sm">
        <button
          class="btn btn-ghost btn-xs -ml-2"
          onclick={() => (showEmoji = !showEmoji)}
          aria-label="Emoji"
        >
          <iconify-icon icon="bx:smile"></iconify-icon>
        </button>
        <input
          type="text"
          bind:value={input}
          onkeydown={handleKeydown}
          placeholder="Ketik pesan..."
          class="grow"
          disabled={loading}
        />
      </label>
      <button
        class="btn btn-primary btn-sm"
        onclick={send}
        disabled={loading || !input.trim()}
        aria-label="Kirim"
      >
        <iconify-icon icon="bx:send"></iconify-icon>
      </button>
      {#if showEmoji}
        <div
          class="absolute bottom-full left-0 mb-1 p-2 bg-base-100 border border-base-300 rounded-box shadow-xl grid grid-cols-8 text-lg"
        >
          {#each ["😊", "😂", "❤️", "👍", "🔥", "🎉", "🙏", "😁", "🥺", "😅", "🤔", "✨", "🙌", "💪", "👏", "⭐", "🤗", "😍", "🥳", "😎", "💯", "🔥", "💡", "🎯"] as e}
            <button
              class="btn btn-ghost btn-xs p-0 size-8 flex items-center justify-center"
              onclick={() => {
                input += e + " ";
                showEmoji = false;
              }}
            >
              {e}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<div class="fixed -bottom-2 right-2 z-50">
  <div class="tooltip tooltip-left" data-tip="Ada Pertanyaan?">
    <button onclick={toggle} aria-label="Buka Asisten" class="">
      <div
        class="cursor-pointer
          hover:filter-[drop-shadow(0_0_8px_var(--color-secondary))]"
      >
        <Char closeeye={app.showPassphrase} />
      </div>
    </button>
  </div>
</div>

<style>
  .chat-sm {
    font-size: 0.75rem;
  }
</style>
