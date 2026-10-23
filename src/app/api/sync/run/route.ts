import { json, requireSession, route } from "@/lib/api";
import { syncOutbox } from "@/lib/sync";

// Manually push pending Postgres outbox rows to Neo4j.
export const POST = route(async () => {
  await requireSession(["admin"]);
  return json(await syncOutbox());
});
