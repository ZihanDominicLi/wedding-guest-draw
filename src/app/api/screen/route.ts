import { ok } from "@/lib/http";
import { getScreenSnapshot } from "@/modules/live/snapshot";

export async function GET() {
  return ok(await getScreenSnapshot());
}
