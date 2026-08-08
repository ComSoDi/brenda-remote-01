// scripts/rename-medications-to-tasks.js
// One-time migration: rename the "medications" MongoDB collection to "tasks"
// (atomic rename — preserves all existing documents and indexes).
// Run with: npm run migrate:rename-tasks

import { MongoClient } from "mongodb";
import dns from "dns";

const DNS_SERVERS = process.env.DNS_SERVERS || process.env.DNS_SERVER || "";
if (DNS_SERVERS) {
  const servers = DNS_SERVERS.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ai_chat";

if (!uri) {
  console.error("MONGODB_URI not set — run with: npm run migrate:rename-tasks");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log("=== RENAME medications -> tasks ===");

  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

  if (existing.has("tasks")) {
    console.log("  \"tasks\" already exists — nothing to do (migration already ran).");
  } else if (!existing.has("medications")) {
    console.log("  \"medications\" not found — nothing to rename (fresh DB, or already migrated and later dropped).");
  } else {
    const count = await db.collection("medications").countDocuments();
    await db.collection("medications").rename("tasks");
    console.log(`  renamed "medications" -> "tasks" (${count} documents preserved)`);
  }

  await client.close();
  console.log("\nDone.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
