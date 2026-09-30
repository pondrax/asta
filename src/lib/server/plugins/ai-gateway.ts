import { env } from "$env/dynamic/private";

/**
 * The one place that talks to the model gateway.
 *
 * Three features reach the same upstream — the platform chatbot, the editor's
 * fixed rewrite actions, and the editor's free-form editing chat — and each
 * used to hand-roll its own `fetch`, model default, and key. That meant a
 * change to the endpoint or the model name had to be made in several places,
 * and the places drifted. This module owns the transport; callers own their
 * prompts and their response format.
 */

export const AI_API = env.AI_URL || "http://localhost:20128/v1/chat/completions";

export const AI_MODEL = env.AI_MODEL || "oc/big-pickle";

export type GatewayRole = "system" | "user" | "assistant";

export interface GatewayMessage {
  role: GatewayRole;
  content: string;
}

export interface GatewayOptions {
  /** Streams `data:` lines instead of returning one JSON body. */
  stream?: boolean;
  signal?: AbortSignal;
  /**
   * Overrides the sampling temperature.
   *
   * Defaults to 0, and that default is load-bearing. At the default temperature
   * this model intermittently splices unrelated tokens into otherwise correct
   * sentences — "Platform Tanda Tangan Elektronik moorjoelue", "Halo! 👋-platform
   * singkasan" — which reads as mojibake to the user. Greedy decoding removes
   * the sampling step that produces them, and costs nothing here: the prompts
   * are factual platform questions with one right answer, not creative writing.
   */
  temperature?: number;
}

/**
 * Sends `messages` to the gateway and hands back the raw `Response`.
 *
 * Deliberately unopinionated about the status code: a 429 needs a different
 * response from the caller than a 502 does, so the caller decides what to
 * surface. Network failures are left to throw — callers that must not fail
 * (the platform chatbot) catch it themselves.
 */
export function callGateway(
  messages: GatewayMessage[],
  { stream = false, signal, temperature = 0 }: GatewayOptions = {},
): Promise<Response> {
  return fetch(AI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AI_KEY || "no-key"}`,
    },
    body: JSON.stringify({ model: AI_MODEL, messages, stream, temperature }),
    signal,
  });
}

/** Coerces an untrusted JSON value to a string, treating anything else as "". */
export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Pulls the assistant text out of a non-streaming completion.
 *
 * Handles the array-of-parts shape some gateways use for `content` in addition
 * to the plain string, because which one you get is a gateway detail the
 * callers should not each have to re-learn.
 */
export function extractText(body: unknown): string {
  const choice = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string" ? part : readString((part as { text?: unknown })?.text),
      )
      .join("");
  }
  return "";
}

/**
 * Strips the wrappers models add despite instructions: a fenced code block, a
 * leading "Here is…"-style preamble, and stray markdown emphasis.
 *
 * This matters because the output of the rewrite actions is pasted straight
 * into a document, where a stray "Sure!" reads as if the user typed it.
 */
export function tidyModelOutput(raw: string): string {
  let out = raw.trim();

  const fence = out.match(/^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();

  out = out.replace(
    /^(?:here(?:'s| is)|berikut(?: hasil)?nya|hasilnya|sure|okay|ok)\b[^\n:]*:\s*/i,
    "",
  );

  return out.trim();
}

/** Suffix marking that a document excerpt was cut short at the character cap. */
export const TRUNCATION_NOTE = "\n\n[teks dipotong]";
