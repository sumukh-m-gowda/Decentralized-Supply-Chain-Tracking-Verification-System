// Applies db/neo4j/constraints.cypher
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import neo4j from "neo4j-driver";

config({ path: ".env.local" });

const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  throw new Error("NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD must be set in .env.local");
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
let session;

try {
  const statements = readFileSync("db/neo4j/constraints.cypher", "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("//"))
    .join(" ")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  session = driver.session({ database: process.env.NEO4J_DATABASE || undefined });
  for (const statement of statements) {
    await session.run(statement);
    console.log("ok:", statement.slice(0, 70));
  }
} finally {
  try {
    if (session) await session.close();
  } finally {
    await driver.close();
  }
}
