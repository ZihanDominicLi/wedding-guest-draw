import { liveEventBus } from "@/modules/live/bus";
import { getScreenSnapshot } from "@/modules/live/snapshot";

const encoder = new TextEncoder();

export async function GET(request: Request) {
  const lastEventId = Number(request.headers.get("last-event-id") ?? 0);
  const replay = liveEventBus.replay("screen", Number.isFinite(lastEventId) ? lastEventId : 0);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: { id: number; type: string; payload: unknown }) => controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
      controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(await getScreenSnapshot())}\n\n`));
      if (replay.mode === "replay") replay.events.forEach(send);
      const unsubscribe = liveEventBus.subscribe((event) => { if (event.scope === "screen") send(event); });
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 15_000);
      request.signal.addEventListener("abort", () => { clearInterval(heartbeat); unsubscribe(); controller.close(); }, { once: true });
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
