import { ok } from "@/lib/http";
import { getScreenSnapshot } from "@/modules/live/snapshot";

export async function GET() {
  const response = ok(await getScreenSnapshot());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
