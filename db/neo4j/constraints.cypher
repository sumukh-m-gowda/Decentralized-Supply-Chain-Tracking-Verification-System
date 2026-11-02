//run only once
CREATE CONSTRAINT item_serial IF NOT EXISTS FOR (i:Item) REQUIRE i.serial_no IS UNIQUE;
CREATE CONSTRAINT org_id IF NOT EXISTS FOR (o:Organization) REQUIRE o.org_id IS UNIQUE;
CREATE CONSTRAINT batch_id IF NOT EXISTS FOR (b:Batch) REQUIRE b.batch_id IS UNIQUE;
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.product_id IS UNIQUE;
CREATE INDEX held_by_event IF NOT EXISTS FOR ()-[h:HELD_BY]-() ON (h.event_id);
CREATE INDEX shipped_to_shipment IF NOT EXISTS FOR ()-[s:SHIPPED_TO]-() ON (s.shipment_id);
