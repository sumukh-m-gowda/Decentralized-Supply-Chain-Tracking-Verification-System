Test cases to write (brief item 15):
1. Non-owner tries to transfer an item: rejected.
2. Transfer fails midway: transaction rolls back, no partial data.
3. UPDATE/DELETE on custody_events: blocked by trigger.
4. Tampered hash (trigger disabled, row edited): verify_chain reports broken.
5. Expiry before manufacture date: rejected by CHECK.
6. Manufacturer calls an admin-only API: 403.
7. Temperature breach reading: alert row created by trigger.
8. Neo4j down during dispatch: outbox row stays pending, then syncs later.
9. Recall query returns every downstream holder for a batch.
10. Query time with and without index (EXPLAIN ANALYZE).
