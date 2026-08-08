// scripts/grandfather-account-status.js
// One-time migration: set userAccountStatus: "Active" on every existing
// user doc that doesn't have it yet (pre-dates the account-deletion feature).
// Run with: npm run migrate:account-status

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
  console.error("MONGODB_URI not set — run with: npm run migrate:account-status");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log("=== GRANDFATHER userAccountStatus ===");

  const r = await db.collection("users").updateMany(
    { userAccountStatus: { $exists: false } },
    { $set: { userAccountStatus: "Active" } }
  );
  console.log(`  users updated: ${r.modifiedCount}`);

  await client.close();
  console.log("\nDone.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
