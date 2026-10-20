<script lang="ts">
  import { marked } from "marked";
  import { goto } from "$app/navigation";
  import Char from "./char.svelte";
  import { app } from "$lib/app/index.svelte";
  import { chat } from "$lib/app/chat.svelte";
  import {
    getEditorBridge,
    hasEditorBridge,
    type ApplyMode,
  } from "$lib/app/editor-bridge.svelte";
  // Only for the type: the steps themselves come from the server, already
  // validated by the shared plan parser.
  import type { PlanStep } from "$lib/editor-ai-plan";
  import { ROUTE_TITLES } from "$lib/app/titles";
  import { sanitizeModelText, stripForeignChars } from "$lib/utils/ai-output";
  import { version } from "$app/environment";
  import pkg from "../../../package.json";

  const appVersion = pkg.version;

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

  // GitHub-style alerts: "> [!info] Title". The system prompt tells the model to
  // emit these and the FAQ fast-path is built out of them, but marked has no
  // notion of the syntax — without this they reach the user as literal
  // "[!info]" text.
  //
  // Rendered as a coloured header rather than a box: send() splits the finished
  // reply on blank lines into one bubble per paragraph, so a title and its body
  // land in different bubbles and any wrapper would be left holding nothing.
  const ALERT_ICONS: Record<string, string> = {
    info: "bx:info-circle",
    note: "bx:note",
    tip: "bx:bulb",
    success: "bx:check-circle",
    warning: "bx:error",
    error: "bx:x-circle",
    step: "bx:right-arrow-circle",
  };

  renderer.blockquote = (token: any) => {
    const text: string = token?.text ?? "";
    const match = text.match(/^\[!(\w+)\]\s*(.*)/);
    if (!match) return `<blockquote>${marked.parse(text)}</blockquote>`;
    const kind = match[1].toLowerCase();
    const title = match[2].trim();
    const icon = ALERT_ICONS[kind] ?? "bx:info-circle";
    const rest = text.slice(match[0].length).replace(/^\n+/, "");
    const head =
      `<div class="chat-alert chat-alert-${kind}">` +
      `<iconify-icon icon="${icon}"></iconify-icon>` +
      `<span>${title ? marked.parseInline(title) : ""}</span>` +
      `</div>`;
    return rest.trim() ? head + (marked.parse(rest) as string) : head;
  };

  marked.setOptions({ renderer });
  const render = (text: string) => marked.parse(text) as string;

  // Visibility lives in a shared store rather than here, because pages offer
  // their own "AI" menu entries that open this panel and the panel is mounted
  // once, in the root layout, with no handle for them to reach.
  const open = $derived(chat.open);
  let messages = $state<{ role: "user" | "assistant"; content: string }[]>([]);
  let input = $state("");
  let loading = $state(false);

  let chatbox = $state() as HTMLDivElement | undefined;
  let chatInput = $state() as HTMLInputElement | undefined;
  let showEmoji = $state(false);
  let abortCtrl = $state<AbortController | null>(null);
  let scrollTick = $state(0);
  let ttfb = $state(0); // time to first token (ms)
  let totalTime = $state(0); // total response time (ms)
  // Set when the user stops a reply, so the transcript can say why it ends
  // mid-sentence instead of looking like the model gave up.
  let stopped = $state(false);

  // Retry repeats the last question, so it needs one to exist and needs the
  // reply to have settled first.
  const canRetry = $derived(!loading && messages.some((m) => m.role === "user"));

  // The streaming placeholder is appended empty so deltas have somewhere to
  // land. It is filtered out here so an empty bubble is never on screen — the
  // dots bubble stands in for it until the first token arrives.
  const visible = $derived(
    messages.filter((m) => !(loading && m.role === "assistant" && !m.content)),
  );

  let {
    user = $bindable(undefined),
  }: { user?: { email?: string; role?: { name?: string } } | null } = $props();

  // ─── Document edit mode ────────────────────────────────────────────
  // Off by default. When on, messages go to the document assistant instead of
  // the platform chatbot, and replies come back as text destined for the
  // document. Turned on deliberately, and only offered where an editor is
  // actually mounted, so the two assistants never answer the same message.
  let editMode = $state(false);
  /**
   * The last document reply, held for review. Never applied without this
   * being set by a real reply, and never applied automatically: a chat message
   * rewriting an open document is a surprising thing to happen.
   *
   * `steps` is set when the reply was structural — a column resize, a shaded
   * row, a new table. Those are not text, so the proposal is reviewed the same
   * way (shown, then applied on request) but goes through the plan lane rather
   * than a paste. Mutually exclusive with `text` being the thing to write:
   * a plan carries its own summary, and pasting the summary as well would put a
   * sentence about column widths into the document.
   */
  let pendingEdit = $state<{
    text: string;
    mode: ApplyMode;
    steps?: PlanStep[];
    summary?: string;
  } | null>(null);
  let editError = $state<string | null>(null);
  let applying = $state(false);

  // ─── Docked / full-height mode ────────────────────────────────────
  // Two presentations for the same conversation. Closed-by-default: a
  // compact card floating above the page's own FABs. Docked: a full-height
  // column pinned to the right edge, the way a sidebar is expected to behave.
  //
  // Docked pushes the page content and navbar aside instead of covering them;
  // the page's own bottom-right FABs move with them, via the <html> hook
  // below. The FABs cannot be moved from inside this component, because they
  // belong to whichever route is mounted.
  let docked = $state(false);

  // Docking is a preference; `open` is the panel's visibility. Laying out the
  // page as if a sidebar were there while no sidebar was on screen would
  // leave a gap and strand the FAB that reopens the panel, so the page only
  // ever responds to the panel actually being on screen.
  const dockedOnScreen = $derived(docked && open);

  function toggleDocked() {
    docked = !docked;
    // The panel's height changes, so the transcript's scroll geometry does
    // too. Jump to the tail so the newest message is not left off-screen.
    followTail = true;
    requestAnimationFrame(() => scrollChat(true));
  }

  // Publish the docked state on <html> rather than through a prop or store.
  // The things that need to move out of the way — the route's own bottom-right
  // FABs, the content column, the navbar — live in other components and
  // inside `position: fixed`, so a class on this component's panel cannot
  // reach them. A data attribute on the root is the one hook every part of
  // the tree can see, and the CSS that reacts to it lives in app.css.
  $effect(() => {
    const root = document.documentElement;
    if (dockedOnScreen) root.dataset.chatDocked = "true";
    else delete root.dataset.chatDocked;
    return () => {
      delete root.dataset.chatDocked;
    };
  });

  // Read on every render rather than captured once, because the editor page
  // registers the bridge on mount and clears it on unmount, while this
  // component lives for the whole session in the root layout.
  const canEdit = $derived(!!user && hasEditorBridge());

  $effect(() => {
    // Leaving the editor must not leave the panel stuck in edit mode, where
    // every message would fail for want of a document.
    if (editMode && !canEdit) editMode = false;
  });

  function toggleEditMode() {
    if (!canEdit) return;
    editMode = !editMode;
    pendingEdit = null;
    editError = null;
    if (editMode && messages.length === 0) {
      messages = [
        {
          role: "assistant",
          content: `Mode **sunting dokumen** aktif.

Saya bekerja pada teks yang sedang dipilih di dokumen, atau seluruh dokumen jika tidak ada selection. Kalau dokumennya masih kosong, saya bisa menulis dari nol — cukup katakan apa yang Anda butuhkan. Contoh: "tulis pengantar satu paragraf" atau "buatkan lebih resmi".

Saya juga bisa mengubah bentuk dokumennya, bukan hanya kalimatnya: menambah tabel, menambah baris atau kolom, mewarnai baris judul, dan mengubah lebar kolom. Cukup sebutkan ukuran dalam sentimeter, misalnya "lebar kolom pertama 2 cm". Semua perubahan saya tampilkan dulu untuk Anda periksa sebelum diterapkan.`,
        },
      ];
    }
    requestAnimationFrame(() => scrollChat(true));
  }

  async function applyPendingEdit() {
    if (!pendingEdit) return;
    applying = true;
    try {
      // Awaits: a reply containing a table is written as a real table, and a
      // plan is replayed step by step, so the spinner stays up until the
      // document has actually changed.
      if (pendingEdit.steps?.length) {
        const result = await getEditorBridge().applyPlan(pendingEdit.steps);
        // The toast already says what happened in detail; this only corrects
        // the record when part of a plan was refused, so the user is not left
        // believing the whole request went through.
        if (result.refused > 0) {
          // No trailing period of its own: the reason from the executor usually
          // ends in one, and `... not 3..` reads as a rendering bug.
          const why = result.reason?.replace(/[.\s]+$/, "");
          editError = why
            ? `Sebagian perubahan tidak diterapkan — ${why}.`
            : "Sebagian perubahan tidak diterapkan.";
        }
        pendingEdit = null;
        return;
      }
      await getEditorBridge().applyText(pendingEdit.text, pendingEdit.mode);
      pendingEdit = null;
    } catch (e) {
      editError = e instanceof Error ? e.message : String(e);
    } finally {
      applying = false;
    }
  }

  function discardPendingEdit() {
    pendingEdit = null;
    editError = null;
  }

  const routeLabels: Record<string, string> = ROUTE_TITLES;

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

  /**
   * Whether the transcript should follow new content.
   *
   * The old test was "are we within 80px of the bottom *right now*", which
   * fails while a reply is streaming in: one frame can add several hundred
   * pixels, the threshold is already blown by the time the scroll is
   * attempted, and the transcript silently stops following. Worse, the
   * transcript was left stranded mid-history, hiding the newest reply.
   *
   * So intent is tracked instead of position. Sending a message or scrolling
   * back down re-arms it; scrolling up by hand disarms it, so reading earlier
   * turns is not yanked away by an incoming stream.
   */
  let followTail = $state(true);

  function handleChatScroll() {
    if (!chatbox) return;
    const gap = chatbox.scrollHeight - chatbox.scrollTop - chatbox.clientHeight;
    followTail = gap < 24;
  }

  function scrollChat(force = false) {
    if (!chatbox) return;
    if (!force && !followTail) return;
    chatbox.scrollTo({
      top: chatbox.scrollHeight,
      behavior: force ? "instant" : "smooth",
    });
  }

  $effect(() => {
    if (open && chatbox) {
      scrollTick; // track all scroll triggers (new msg + stream updates)
      requestAnimationFrame(() => scrollChat());
    }
  });

  $effect(() => {
    if (open && chatInput) {
      requestAnimationFrame(() => chatInput!.focus());
    }
  });

  function toggle() {
    if (chat.open) {
      chat.open = false;
      return;
    }
    chat.openChat();
  }

  // The greeting is seeded on first open, whichever way the panel was opened.
  $effect(() => {
    if (!chat.open) return;
    followTail = true;
    if (messages.length === 0) {
      messages = [
        {
          role: "assistant",
          content: `# Halo! 👋

Saya adalah asisten AI **Tapak Astà**. 
Silakan tanyakan apa saja tentang layanan ini! 😊`,
        },
      ];
    }
  });

  // A question handed over by a page's AI menu is sent as soon as the panel is
  // on screen: the user asked for it by picking the menu entry, so it should
  // not need a second click to actually go.
  $effect(() => {
    if (!chat.open) return;
    const prompt = chat.pending;
    if (!prompt) return;
    chat.pending = null;
    void ask(prompt);
  });

  /** Sends `text` as if the user had typed it. Used by page-level AI menus. */
  async function ask(text: string) {
    input = text;
    await send();
  }

  /**
   * Splits a reply into one bubble per paragraph. Used both while the reply is
   * still streaming and on the finished text, so the transcript looks the same
   * throughout instead of collapsing into a single bubble and then jumping
   * apart when the stream ends.
   *
   * The trailing element is whatever follows the last blank line — during
   * streaming that is the paragraph still being written, so it keeps growing in
   * place. Empty parts are dropped so a trailing blank line never renders as an
   * empty bubble.
   */
  function splitParagraphs(text: string): string[] {
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    input = "";
    // Context handed over by a page's AI menu rides along with this question
    // only, so it cannot leak into unrelated later turns.
    const docContext = chat.context;
    chat.context = null;
    // Cancel previous stream
    if (abortCtrl) {
      abortCtrl.abort();
      abortCtrl = null;
    }
    messages = [...messages, { role: "user", content: text }];
    // Sending implies wanting to watch the reply arrive.
    followTail = true;
    scrollTick++;
    scrollChat(true);
    loading = true;
    stopped = false;
    ttfb = 0;
    totalTime = 0;
    if (editMode) {
      await sendDocumentEdit(text);
      return;
    }
    const t0 = performance.now();
    let firstToken = true;
    // Declared outside the try so the abort path can keep whatever had
    // already streamed in before the user pressed Stop.
    let full = "";
    // Index of the streaming placeholder in `messages`. Every update rebuilds
    // the transcript from this point, so the reply can be re-split into bubbles
    // as it arrives without disturbing the history above it. Declared here so
    // the abort and error paths can rebuild from the same point.
    let streamStart = messages.length;
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
        if (docContext) {
          // The gateway only honours the first system message, so a document
          // handed over as its own system turn is silently dropped and the
          // model answers "I can't see the document". It has to ride inside
          // the user turn instead. Only this outgoing copy is augmented — the
          // bubble keeps showing just the question.
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === "user") {
              msgs[i] = {
                role: "user",
                content: `<dokumen>\n${docContext}\n</dokumen>\n\n${msgs[i].content}`,
              };
              break;
            }
          }
        }
        const ctx: { role: "system"; content: string }[] = [];
        if (userCtx) ctx.push(userCtx);
        return [...ctx, ...msgs];
      };
      // Add empty assistant message for streaming.
      streamStart = messages.length;
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
              // Character-level filtering only, so a corrupt token never
              // reaches the screen. Safe per-delta because TextDecoder emits
              // whole characters even when a chunk ends mid-sequence.
              full += stripForeignChars(delta);
              if (firstToken) {
                ttfb = Math.round(performance.now() - t0);
                firstToken = false;
              }
              messages = [
                ...messages.slice(0, streamStart),
                ...splitParagraphs(full).map((c) => ({
                  role: "assistant" as const,
                  content: c,
                })),
              ];
              scrollTick++;
            }
          } catch {}
        }
      }
      totalTime = Math.round(performance.now() - t0);
      // Finalize: the structural cleanup runs here, once, on the assembled
      // reply — line-anchored rules like "a row of `---` is a rule, a table
      // separator is not" would misfire on a partial line mid-stream. Applying
      // the character-level strip above already kept the live render clean, so
      // this pass only tidies spacing and drops leftover filler rows.
      const clean = sanitizeModelText(full);
      messages = [
        ...messages.slice(0, streamStart),
        ...splitParagraphs(clean).map((c) => ({
          role: "assistant" as const,
          content: c,
        })),
      ];
      scrollTick++;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Stopping keeps the part that already arrived. The bubble is kept
        // even when nothing arrived, because it is what carries the
        // "Dihentikan" note and the Retry button — dropping it would leave
        // the question with no way to ask it again.
        const kept = splitParagraphs(sanitizeModelText(full));
        messages = [
          ...messages.slice(0, streamStart),
          // An empty bubble is kept when nothing arrived, because it is what
          // carries the "Dihentikan" note and the Retry button.
          ...(kept.length ? kept : [""]).map((c) => ({
            role: "assistant" as const,
            content: c,
          })),
        ];
        stopped = true;
        scrollTick++;
        return;
      }
      messages = [
        ...messages.slice(0, streamStart),
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

  /** Cancels the reply in flight. Whatever already streamed in is kept. */
  function stop() {
    abortCtrl?.abort();
  }

  /**
   * Asks the last question again. The previous reply is dropped first, so
   * retrying replaces the answer instead of stacking a second one under it.
   */
  function retry() {
    if (loading) return;
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser < 0) return;
    const text = messages[lastUser].content;
    messages = messages.slice(0, lastUser);
    void ask(text);
  }

  /**
   * Sends a message to the document assistant.
   *
   * Not streamed: the reply is JSON wrapping the finished text, so there is
   * nothing to show token by token, and streaming would mean rendering partial
   * JSON. The context is read here, at send time, because that is the moment
   * the selection is still meaningful.
   */
  async function sendDocumentEdit(text: string) {
    pendingEdit = null;
    editError = null;

    // An empty document is allowed through on purpose: it is the normal state
    // of a document that is being started, and asking the assistant to write
    // the first paragraph is the single most obvious thing to want then. A
    // missing editor is different — there is nowhere for the reply to go.
    if (!hasEditorBridge()) {
      editError = "The editor is not ready yet.";
      messages = [
        ...messages,
        {
          role: "assistant",
          content:
            "Penyuntingnya belum siap. Buka halaman editor, lalu coba lagi.",
        },
      ];
      scrollTick++;
      loading = false;
      return;
    }

    let context = "";
    let map = "";
    let hasSelection = false;
    try {
      const bridge = getEditorBridge();
      context = bridge.readContext();
      hasSelection = bridge.hasSelection();
      // The structure listing, not the text. Without it the model cannot see
      // that a table exists at all, so "make the first column narrower" comes
      // back as a sentence about column widths instead of a plan. Read
      // separately rather than derived from `context` because the two are
      // different readings of the same document.
      map = bridge.readMap();
    } catch (e) {
      editError = e instanceof Error ? e.message : String(e);
      loading = false;
      return;
    }

    try {
      // Only this document conversation, not the platform chat history that
      // precedes it — those turns are about the app, not the text.
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(0, -1)
        .slice(-6);

      const res = await fetch("/api/editor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          source: context,
          hasSelection,
          map,
          history,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.message ||
            payload?.error ||
            `Permintaan gagal (${res.status}).`,
        );
      }
      if (typeof payload?.text !== "string" || !payload.text.trim()) {
        throw new Error("AI tidak mengembalikan teks.");
      }

      const mode: ApplyMode = payload.mode === "replace" ? "replace" : "insert";
      // The steps are already narrowed by the server's `parsePlan`, the same
      // allowlist the AI menu's plans go through, and they are only replayed
      // when the user presses Terapkan. Typed as `PlanStep[]` because nothing
      // but the server can put them in this response.
      const steps: PlanStep[] | undefined = Array.isArray(payload.steps)
        ? (payload.steps as PlanStep[])
        : undefined;
      const summary: string | undefined =
        typeof payload.summary === "string" ? payload.summary : undefined;
      // Show the proposed change rather than writing it. The user can see
      // what the model did before it touches the document.
      messages = [
        ...messages,
        {
          role: "assistant",
          content: payload.text.trim(),
        },
      ];
      pendingEdit = { text: payload.text.trim(), mode, steps, summary };
      scrollTick++;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : String(e);
      editError = msg;
      messages = [
        ...messages,
        { role: "assistant", content: `Maaf, permintaan gagal: ${msg}` },
      ];
      scrollTick++;
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
  <!-- `z-120`, not `z-50`: docked, the panel runs from the top of the viewport
       down, so its header shares the navbar's band. The navbar is `z-[110]`
       (see the root layout) and was painting over the header, leaving the
       minimise and close buttons unclickable. The panel is meant to be on top
       there — that is why app.css shifts the navbar's right-hand controls left
       by the panel's width. Still below the editor FAB (`z-1000`) and the
       toast stack (`z-9999`). -->
  <div
    class="fixed z-120 flex flex-col overflow-hidden bg-base-100
      {docked
      ? 'inset-y-0 right-0 w-full max-w-md border-l border-base-300 shadow-2xl'
      : 'bottom-18 right-4 w-80 max-h-[70dvh] rounded-box border border-base-300 shadow-2xl sm:w-96'}"
  >
    <div
      class="flex items-center justify-between px-4 py-3 bg-primary text-primary-content"
    >
      <span class="font-semibold text-sm flex items-center gap-2">
        <iconify-icon icon={editMode ? "bx:edit-alt" : "bx:bot"}></iconify-icon>
        {editMode ? "Sunting Dokumen" : "Asisten AI"}
        <span class="text-[10px] font-mono font-normal opacity-70"
          >v{appVersion} #{version.slice(0, 7)}</span
        >
      </span>
      <div class="flex items-center gap-1">
        <!-- Only where an editor is mounted, and only for signed-in users. -->
        {#if canEdit}
          <div
            class="tooltip tooltip-bottom"
            data-tip={editMode
              ? "Kembali ke asisten aplikasi"
              : "Bantu sunting dokumen ini"}
          >
            <button
              class="btn btn-ghost btn-xs btn-circle text-primary-content"
              onclick={toggleEditMode}
              aria-label={editMode
                ? "Kembali ke asisten aplikasi"
                : "Bantu sunting dokumen"}
              aria-pressed={editMode}
            >
              <iconify-icon icon={editMode ? "bx:bot" : "bx:pencil"}
              ></iconify-icon>
            </button>
          </div>
        {/if}
        <div
          class="tooltip tooltip-bottom"
          data-tip={docked ? "Kecilkan panel" : "Perbesar panel"}
        >
          <button
            class="btn btn-ghost btn-xs btn-circle text-primary-content"
            onclick={toggleDocked}
            aria-label={docked ? "Kecilkan panel" : "Perbesar panel"}
            aria-pressed={docked}
          >
            <!-- Icon names verified against the Iconify API: the obvious
                 `bx:collapse-alt-*` guesses do not exist in Boxicons and
                 rendered as an empty button. `bx:sidebar` and `bx:fullscreen`
                 both resolve. -->
            <iconify-icon icon={docked ? "bx:sidebar" : "bx:fullscreen"}
            ></iconify-icon>
          </button>
        </div>
        <button
          class="btn btn-ghost btn-xs btn-circle text-primary-content"
          onclick={toggle}
          aria-label="Tutup"
        >
          <iconify-icon icon="bx:x"></iconify-icon>
        </button>
      </div>
    </div>

    <div
      bind:this={chatbox}
      onscroll={handleChatScroll}
      class="flex-1 overflow-y-auto p-3 space-y-3
        {docked ? 'min-h-0' : 'min-h-72 max-h-96'}"
    >
      {#each visible as msg, i (msg.role + i)}
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
              {#if !loading && i === visible.length - 1}
                <div class="flex items-center gap-2 mt-1 select-none">
                  {#if totalTime > 0}
                    <span class="text-[10px] text-base-content/40">
                      ⚡ {ttfb}ms first token · {totalTime}ms total
                    </span>
                  {:else if stopped}
                    <span class="text-[10px] text-base-content/40">
                      Dihentikan
                    </span>
                  {/if}
                  {#if canRetry}
                    <button
                      class="btn btn-ghost btn-xs gap-1 normal-case text-base-content/50"
                      onclick={retry}
                      aria-label="Ulangi"
                    >
                      <iconify-icon icon="bx:refresh"></iconify-icon>
                      Ulangi
                    </button>
                  {/if}
                </div>
              {/if}
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

    <!-- The proposal bar. Nothing reaches the document until Apply is
         pressed, so the model cannot quietly rewrite an open document. -->
    {#if pendingEdit || editError}
      <div
        class="border-t border-base-300 bg-base-200/60 px-3 py-2 flex items-center gap-2"
      >
        <iconify-icon
          icon={editError ? "bx:error-circle" : "bx:check-circle"}
          class={editError ? "text-error shrink-0" : "text-success shrink-0"}
        ></iconify-icon>
        <span class="text-xs grow" class:text-error={!!editError}>
          {#if editError}
            {editError}
          {:else if pendingEdit?.steps?.length}
            {pendingEdit.summary || "Perubahan struktur siap diterapkan."}
          {:else}
            {pendingEdit?.mode === "replace"
              ? "Siap menggantikan teks yang dipilih."
              : "Siap disisipkan di posisi kursor."}
          {/if}
        </span>
        {#if pendingEdit}
          <button
            class="btn btn-ghost btn-xs"
            onclick={discardPendingEdit}
            disabled={applying}
          >
            Buang
          </button>
          <button
            class="btn btn-primary btn-xs"
            onclick={applyPendingEdit}
            disabled={applying}
          >
            {#if applying}
              <span class="loading loading-spinner loading-xs"></span>
            {/if}
            Terapkan
          </button>
        {/if}
      </div>
    {/if}

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
          placeholder={editMode ? "Apa yang perlu diubah?" : "Ketik pesan..."}
          class="grow"
        />
      </label>
      {#if loading}
        <button
          class="btn btn-error btn-sm"
          onclick={stop}
          aria-label="Hentikan"
        >
          <iconify-icon icon="bx:stop"></iconify-icon>
        </button>
      {:else}
        <button
          class="btn btn-primary btn-sm"
          onclick={send}
          disabled={!input.trim()}
          aria-label="Kirim"
        >
          <iconify-icon icon="bx:send"></iconify-icon>
        </button>
      {/if}
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

<!-- Gated on `dockedOnScreen`, not on `docked`: the FAB is the only way back
     into a docked panel, so hiding it whenever docking is merely *preferred*
     would leave no way to reopen after closing. Hidden during the tour too, so
     it can't sit under the tour card on small screens. -->
{#if !dockedOnScreen && !app.showTour}
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
{/if}

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

  /* Alert headers built from "> [!type] Title" blockquotes. The reply is split
     into one bubble per paragraph, so this is a coloured header line rather
     than a box — the body follows as its own bubble. */
  .chat-sm :global(.chat-alert) {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 700;
    font-size: 0.75rem;
    margin: 0.125rem 0;
    color: var(--color-info);
  }
  .chat-sm :global(.chat-alert-note) {
    color: var(--color-neutral);
  }
  .chat-sm :global(.chat-alert-tip),
  .chat-sm :global(.chat-alert-success) {
    color: var(--color-success);
  }
  .chat-sm :global(.chat-alert-warning) {
    color: var(--color-warning);
  }
  .chat-sm :global(.chat-alert-error) {
    color: var(--color-error);
  }
  .chat-sm :global(.chat-alert-step) {
    color: var(--color-primary);
  }
</style>
