<script lang="ts">
  import { marked } from "marked";
  import { sendMessage } from "$lib/remotes/chat.remote";
  import Char from "./char.svelte";
  import { app } from "$lib/app/index.svelte";

  const renderer = new marked.Renderer();

  // Custom blockquote: > [!type] title\n> content
  renderer.blockquote = (tokens: any) => {
    const text = Array.isArray(tokens)
      ? tokens.map((t: any) => t.raw || t.text || "").join("")
      : (tokens as unknown as string);
    const match = text.match(
      /^\[!(info|warning|success|error|tip|step|note)\]\s*(.*)/i,
    );
    if (match) {
      const [, type, title] = match;
      const body = text.replace(/^\[!\w+\]\s*.*\n?/, "").trim();
      const icons: Record<string, string> = {
        info: "bx-info-circle",
        warning: "bx-error",
        success: "bx-check-circle",
        error: "bx-x-circle",
        tip: "bx-bulb",
        step: "bx-hash",
        note: "bx-note",
      };
      return `<div class="chat-template chat-template-${type.toLowerCase()}"><div class="chat-template-header"><iconify-icon icon="${icons[type.toLowerCase()] || "bx-info-circle"}"></iconify-icon> ${title || type.toUpperCase()}</div>${body ? `<div class="chat-template-body">${marked.parse(body)}</div>` : ""}</div>`;
    }
    // Custom heading: ## [icon] title
    const headingMatch = text.match(/^\[\[(\w[\w:-]*)\]\]\s*(.*)/);
    if (headingMatch) {
      const [, icon, title] = headingMatch;
      return `<div class="chat-template chat-template-card"><div class="chat-template-header"><iconify-icon icon="${icon}"></iconify-icon> ${title}</div></div>`;
    }
    return `<blockquote>${text}</blockquote>`;
  };

  // Custom heading with icon: ## [[icon]] title
  renderer.heading = (tokens: any) => {
    const text = Array.isArray(tokens)
      ? tokens.map((t: any) => t.text || "").join("")
      : (tokens as unknown as string);
    const depth = Array.isArray(tokens) ? tokens[0]?.depth || 1 : 1;
    const match = text.match(/^\[\[(\w[\w:-]*)\]\]\s*(.*)/);
    if (match) {
      const [, icon, title] = match;
      return `<div class="chat-heading"><iconify-icon icon="${icon}"></iconify-icon> <span>${title}</span></div>`;
    }
    const tag = `h${Math.min(depth, 3)}`;
    return `<${tag}>${text}</${tag}>`;
  };

  marked.setOptions({ renderer });
  const render = (text: string) => marked.parse(text) as string;

  let open = $state(false);
  let messages = $state<{ role: "user" | "assistant"; content: string }[]>([]);
  let input = $state("");
  let loading = $state(false);

  let chatbox = $state() as HTMLDivElement | undefined;
  let chatInput = $state() as HTMLInputElement | undefined;
  let showEmoji = $state(false);

  const routeLabels: Record<string, string> = {
    "/sign": "Tanda Tangan",
    "/verify": "Verifikasi",
    "/me": "Dashboard",
    "/me/documents": "Dokumen Saya",
    "/profile": "Profil",
    "/templates": "Template",
    "/survey": "Survey",
    "/main": "Admin",
    "/user-guide": "Panduan",
  };

  function getRouteLabel(path: string): string {
    if (routeLabels[path]) return routeLabels[path];
    for (const [route, label] of Object.entries(routeLabels)) {
      if (path.startsWith(route + "/")) return label;
    }
    return path;
  }

  function extractUrls(text: string): string[] {
    const urlRegex = /\b(https?:\/\/[^\s)}\]]+|\/[a-zA-Z][a-zA-Z0-9\-_/]*)/g;
    const urls: string[] = [];
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      const url = match[1];
      if (url.startsWith("http")) {
        try {
          const u = new URL(url);
          if (u.origin === window.location.origin) urls.push(u.pathname);
        } catch {}
      } else if (url.startsWith("/") && !url.startsWith("//")) {
        urls.push(url);
      }
    }
    return [...new Set(urls)];
  }

  $effect(() => {
    if (open && chatbox) {
      const len = messages.length;
      requestAnimationFrame(() => {
        chatbox!.scrollTop = chatbox!.scrollHeight;
      });
    }
  });

  $effect(() => {
    if (open && chatInput) {
      requestAnimationFrame(() => chatInput!.focus());
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
          {#if msg.role === "assistant"}
            {@const urls = extractUrls(msg.content)}
            {#if urls.length > 0}
              <div class="flex flex-wrap gap-1 mt-1">
                {#each urls as url}
                  <a
                    href={url}
                    class="btn btn-outline btn-primary btn-xs gap-1 normal-case"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <iconify-icon icon="bx:link-external" class="text-xs"
                    ></iconify-icon>
                    {getRouteLabel(url)}
                  </a>
                {/each}
              </div>
            {/if}
          {/if}
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
          bind:this={chatInput}
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
  .chat-sm :global(.chat-template) {
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin: 0.375rem 0;
    font-size: 0.75rem;
    line-height: 1.4;
    border-left: 3px solid;
  }
  .chat-sm :global(.chat-template-info) {
    background: oklch(var(--info) / 0.08);
    border-color: oklch(var(--info));
  }
  .chat-sm :global(.chat-template-warning) {
    background: oklch(var(--warning) / 0.08);
    border-color: oklch(var(--warning));
  }
  .chat-sm :global(.chat-template-success) {
    background: oklch(var(--success) / 0.08);
    border-color: oklch(var(--success));
  }
  .chat-sm :global(.chat-template-error) {
    background: oklch(var(--error) / 0.08);
    border-color: oklch(var(--error));
  }
  .chat-sm :global(.chat-template-tip) {
    background: oklch(var(--secondary) / 0.08);
    border-color: oklch(var(--secondary));
  }
  .chat-sm :global(.chat-template-step) {
    background: oklch(var(--primary) / 0.06);
    border-color: oklch(var(--primary));
  }
  .chat-sm :global(.chat-template-note) {
    background: oklch(var(--neutral) / 0.08);
    border-color: oklch(var(--neutral-content));
  }
  .chat-sm :global(.chat-template-header) {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 600;
    font-size: 0.75rem;
    margin-bottom: 0.25rem;
  }
  .chat-sm :global(.chat-template-body) {
    font-size: 0.6875rem;
    opacity: 0.9;
  }
  .chat-sm :global(.chat-template-body p) {
    margin: 0.125rem 0;
  }
  .chat-sm :global(.chat-template-body ul),
  .chat-sm :global(.chat-template-body ol) {
    margin: 0.125rem 0;
    padding-left: 1rem;
  }
  .chat-sm :global(.chat-heading) {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 700;
    font-size: 0.8125rem;
    margin: 0.5rem 0 0.25rem;
  }
  .chat-sm :global(h3) {
    font-weight: 600;
    font-size: 0.75rem;
    margin: 0.375rem 0 0.125rem;
  }
  .chat-sm :global(ul),
  .chat-sm :global(ol) {
    padding-left: 1rem;
    margin: 0.25rem 0;
  }
  .chat-sm :global(li) {
    margin: 0.125rem 0;
  }
  .chat-sm :global(strong) {
    font-weight: 600;
  }
  .chat-sm :global(code) {
    font-size: 0.6875rem;
    padding: 0.0625rem 0.25rem;
    border-radius: 0.25rem;
    background: oklch(var(--neutral) / 0.15);
  }
</style>
