// scripts/rename-dose-to-quantity.js
// One-time migration: rename the "dose" field to "quantity" on every
// document in the "tasks" collection (top-level field only — no existing
// task has any "history" entries yet, so there's nothing nested to migrate;
// $rename can't reach into array elements anyway if that ever changes).
// Run with: npm run migrate:rename-dose

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
  console.error("MONGODB_URI not set — run with: npm run migrate:rename-dose");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log("=== RENAME field dose -> quantity on tasks ===");

  const r = await db.collection("tasks").updateMany(
    { dose: { $exists: true } },
    { $rename: { dose: "quantity" } }
  );
  console.log(`  documents updated: ${r.modifiedCount}`);

  await client.close();
  console.log("\nDone.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
