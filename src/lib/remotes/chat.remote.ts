import { command } from "$app/server";
import { AI } from "$lib/server/plugins/ai";

const ai = new AI();

export const sendMessage = command("unchecked", async (props: { messages: { role: string; content: string }[] }) => {
  const result = await ai.chat(props.messages as { role: "user" | "assistant"; content: string }[]);
  return { content: result.content, finish_reason: result.finish_reason };
});
