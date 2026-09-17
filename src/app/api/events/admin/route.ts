import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { liveEventBus } from "@/modules/live/bus";
import { getAdminSnapshot } from "@/modules/live/snapshot";

const encoder = new TextEncoder();

export async function GET(request: Request) {
  try { await requireAdmin(request.headers); } catch (error) {
    if (error instanceof UnauthorizedError) return Response.json({ error: "unauthorized" }, { status: 401 });
    throw error;
  }
  const lastEventId = Number(request.headers.get("last-event-id") ?? 0);
  const replay = liveEventBus.replay("admin", Number.isFinite(lastEventId) ? lastEventId : 0);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: { id: number; type: string; payload: unknown }) => controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
      if (replay.mode === "snapshot-required") {
        controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(await getAdminSnapshot())}\n\n`));
      } else replay.events.forEach(send);
      const unsubscribe = liveEventBus.subscribe((event) => { if (event.scope === "admin") send(event); });
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 15_000);
      request.signal.addEventListener("abort", () => { clearInterval(heartbeat); unsubscribe(); controller.close(); }, { once: true });
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
