import { json, num, requireApprovedOrg, requireSession, route } from "@/lib/api";
import { query } from "@/lib/db";
import { syncOutbox } from "@/lib/sync";

// All the real work (ownership check, hash-chain insert, owner update, outbox row) is one DB transaction:
// the transfer_custody() function. The API only calls it.
export const PATCH = route(async (req, ctx) => {
  const s = await requireSession(["manufacturer", "distributor", "retailer"]);
  const orgId = await requireApprovedOrg(s);
  const id = num((await ctx.params).id);
  await query("SELECT transfer_custody($1, $2)", [id, orgId]);
  const graphSync = await syncOutbox().catch((error) => {
    console.error("Shipment dispatched, but Neo4j sync could not start", error);
    return { pending: 0, synced: 0, error: "Graph sync could not start; retry from the admin sync page" };
  });
  return json({ ok: true, graph_sync: graphSync });
});
