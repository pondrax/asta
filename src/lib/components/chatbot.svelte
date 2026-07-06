<script lang="ts">
  import { marked } from "marked";
  import { goto } from "$app/navigation";
  import Char from "./char.svelte";
  import { app } from "$lib/app/index.svelte";

  const renderer = new marked.Renderer();

  // Custom heading with icon: ## [[icon]] title
  renderer.heading = (token: any) => {
    const text =
      token?.text ||
      token?.raw ||
      (Array.isArray(token)
        ? token.map((t: any) => t.text || "").join("")
        : String(token));
    const depth = token?.depth || 1;
    // Match [[icon]] title anywhere in the text
    const match = text.match(/\[\[(\w[\w:.\/-]*)\]\]\s*(.*)/);
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
  let abortCtrl = $state<AbortController | null>(null);
  let scrollTick = $state(0);

  let {
    user = $bindable(undefined),
  }: { user?: { email?: string; role?: { name?: string } } | null } = $props();

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
    return path
      .replace(/^\//, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const authRoutes = new Set(["/me", "/me/documents", "/main"]);
  function isAuthRoute(path: string) {
    return authRoutes.has(path);
  }

  function extractUrls(text: string): string[] {
    const urls: string[] = [];

    // From markdown links: [label](url)
    const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = mdLinkRegex.exec(text)) !== null) {
      const href = match[2].trim();
      let path = href;
      try {
        const u = new URL(href);
        path = u.pathname;
      } catch {}
      path = path.split("?")[0].split("#")[0];
      if (path.startsWith("/") && !path.startsWith("//")) {
        if (!urls.includes(path)) urls.push(path);
      }
    }

    // From known routes mentioned as plain text: /sign, /verify, etc.
    const knownRoutes = new Set(Object.keys(routeLabels));
    for (const route of knownRoutes) {
      const plainRegex = new RegExp(`(?<![\\w/])${route}(?![\\w/])`, "g");
      if (plainRegex.test(text) && !urls.includes(route)) urls.push(route);
    }

    // From full URLs in plain text
    const fullUrlRegex = /https?:\/\/[\w.-]+(?:\.\w+)+([^\s)]*)/g;
    while ((match = fullUrlRegex.exec(text)) !== null) {
      const path = match[1].split("?")[0].split("#")[0] || "/";
      if (path.startsWith("/") && path.length > 1 && !urls.includes(path)) {
        const knownRoutes = new Set(Object.keys(routeLabels));
        for (const route of knownRoutes) {
          if (path === route || path.startsWith(route + "/")) {
            urls.push(route);
            break;
          }
        }
      }
    }

    return [...new Set(urls)].filter((u) => !(isAuthRoute(u) && !user));
  }

  function scrollChat(force = false) {
    if (!chatbox) return;
    if (!force) {
      const nearBottom =
        chatbox.scrollHeight - chatbox.scrollTop - chatbox.clientHeight < 80;
      if (!nearBottom) return;
    }
    chatbox.scrollTo({
      top: chatbox.scrollHeight,
      behavior: force ? "instant" : "smooth",
    });
  }

  $effect(() => {
    if (open && chatbox) {
      scrollTick; // track all scroll triggers (new msg + stream updates)
      requestAnimationFrame(scrollChat);
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
          content: `# Halo! 👋

Saya adalah asisten AI **Tapak Astà**. 
Silakan tanyakan apa saja tentang layanan ini! 😊`,
        },
      ];
    }
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    input = "";
    // Cancel previous stream
    if (abortCtrl) {
      abortCtrl.abort();
      abortCtrl = null;
    }
    messages = [...messages, { role: "user", content: text }];
    scrollTick++;
    scrollChat(true);
    loading = true;
    try {
      const userCtx = user
        ? {
            role: "system" as const,
            content: `Pengguna yang bertanya: ${user.email || "unknown"}${user.role?.name ? ` (${user.role.name})` : ""}`,
          }
        : null;
      const history = () => {
        const msgs = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        return userCtx ? [userCtx, ...msgs] : msgs;
      };
      // Add empty assistant message for streaming
      messages = [...messages, { role: "assistant", content: "" }];
      scrollTick++;
      scrollChat(true);
      abortCtrl = new AbortController();
      const res = await fetch("/api/chat", {
        signal: abortCtrl.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history() }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              messages[messages.length - 1] = {
                role: "assistant",
                content: full,
              };
              scrollTick++;
            }
          } catch {}
        }
      }
      // Finalize: split into chunks
      const chunks = full.split(/\n\n+/).filter(Boolean);
      messages = [
        ...messages.slice(0, -1),
        ...chunks.map((c: any) => ({ role: "assistant" as const, content: c })),
      ];
      scrollTick++;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      messages = [
        ...messages.slice(0, -1),
        {
          role: "assistant",
          content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
        },
      ];
      scrollTick++;
    } finally {
      abortCtrl = null;
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
              {@const urls = extractUrls(msg.content)}
              {#if urls.length > 0}
                <div
                  class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-base-300/50"
                >
                  {#each urls as url}
                    <a
                      href={url}
                      class="btn btn-outline btn-primary btn-xs gap-1 normal-case"
                      onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        goto(url);
                      }}
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
        />
      </label>
      <button
        class="btn btn-primary btn-sm"
        onclick={send}
        disabled={!input.trim()}
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
