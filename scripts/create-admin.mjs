// Usage: npm run create-admin -- admin@example.com "StrongPassword123" "Admin Name"
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";
config({ path: ".env.local" });

const [email, password, name = "Admin"] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: npm run create-admin -- <email> <password> ["Name"]'); process.exit(1); }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
  "INSERT INTO users(org_id, name, email, password_hash, role) VALUES (NULL, $1, $2, $3, 'admin')",
  [name, email.toLowerCase(), await bcrypt.hash(password, 10)]);
console.log(`Admin created: ${email}`);
await client.end();
