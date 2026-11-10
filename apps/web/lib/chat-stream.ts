export type StreamedMessage = { id: string; content: string };

export function applyAssistantStreamEvent<T extends StreamedMessage>(messages: T[], assistantId: string, event: string, text = "") {
  if (event !== "delta" && event !== "reset") return messages;
  return messages.map((message) => message.id === assistantId
    ? { ...message, content: event === "reset" ? "" : message.content + text }
    : message);
}
