// scripts/rename-medication-reminders-to-task-reminders.js
// One-time migration:
//   1. Rename the "medication_reminders" MongoDB collection to "task_reminders"
//      (atomic rename — preserves all existing documents and indexes).
//   2. Rename the "medicationName" field to "taskName" on every document in
//      that collection, so already-pending (undelivered) reminders created
//      before this migration still display correctly under the new field
//      name the code now reads.
// Run with: npm run migrate:rename-task-reminders

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
  console.error("MONGODB_URI not set — run with: npm run migrate:rename-task-reminders");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log("=== RENAME medication_reminders -> task_reminders ===");

  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

  if (!existing.has("task_reminders")) {
    if (!existing.has("medication_reminders")) {
      console.log("  \"medication_reminders\" not found — nothing to rename.");
    } else {
      const count = await db.collection("medication_reminders").countDocuments();
      await db.collection("medication_reminders").rename("task_reminders");
      console.log(`  renamed "medication_reminders" -> "task_reminders" (${count} documents preserved)`);
    }
  } else {
    console.log("  \"task_reminders\" already exists — skipping collection rename.");
  }

  console.log("\n=== RENAME field medicationName -> taskName on task_reminders ===");
  if (existing.has("task_reminders") || existing.has("medication_reminders")) {
    const r = await db.collection("task_reminders").updateMany(
      { medicationName: { $exists: true } },
      { $rename: { medicationName: "taskName" } }
    );
    console.log(`  documents updated: ${r.modifiedCount}`);
  } else {
    console.log("  collection doesn't exist — nothing to do.");
  }

  await client.close();
  console.log("\nDone.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
