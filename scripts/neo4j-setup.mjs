// Applies db/neo4j/constraints.cypher
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import neo4j from "neo4j-driver";
config({ path: ".env.local" });

const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD));
const statements = readFileSync("db/neo4j/constraints.cypher", "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("//")).join(" ").split(";").map((s) => s.trim()).filter(Boolean);
const session = driver.session({ database: process.env.NEO4J_DATABASE || undefined });
for (const s of statements) { await session.run(s); console.log("ok:", s.slice(0, 70)); }
await session.close(); await driver.close();
