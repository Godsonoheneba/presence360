type EventHandler = (event: { event: string; data: string }) => void;

type StreamOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onEvent: EventHandler;
  onOpen?: () => void;
};

export async function streamSse(url: string, options: StreamOptions) {
  const response = await fetch(url, {
    method: "GET",
    headers: options.headers,
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE connection failed (${response.status})`);
  }
  options.onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const chunk of parts) {
      let eventType = "message";
      let data = "";
      chunk.split("\n").forEach((line) => {
        if (line.startsWith("event:")) {
          eventType = line.replace("event:", "").trim();
        }
        if (line.startsWith("data:")) {
          data += line.replace("data:", "").trim();
        }
      });
      if (data) {
        options.onEvent({ event: eventType, data });
      }
    }
  }
}
