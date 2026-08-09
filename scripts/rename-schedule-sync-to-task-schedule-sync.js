// scripts/rename-schedule-sync-to-task-schedule-sync.js
// One-time migration:
//   1. Rename the "medication_schedule_sync" MongoDB collection to
//      "task_schedule_sync" (atomic rename — preserves all documents).
//   2. Rename the "medicationId" field to "taskId" on every document in
//      task_schedule_sync AND task_reminders (both collections used this
//      field name before the code switched to "taskId").
// Run with: npm run migrate:rename-schedule-sync
//
// Note: the only consumer of task_schedule_sync (voice-proxy's scheduler)
// just marks documents processed — it never reads action/taskId to branch
// logic — so this rename is safe even with unprocessed entries pending.

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
  console.error("MONGODB_URI not set — run with: npm run migrate:rename-schedule-sync");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log("=== RENAME medication_schedule_sync -> task_schedule_sync ===");

  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

  if (!existing.has("task_schedule_sync")) {
    if (!existing.has("medication_schedule_sync")) {
      console.log("  \"medication_schedule_sync\" not found — nothing to rename.");
    } else {
      const count = await db.collection("medication_schedule_sync").countDocuments();
      await db.collection("medication_schedule_sync").rename("task_schedule_sync");
      console.log(`  renamed "medication_schedule_sync" -> "task_schedule_sync" (${count} documents preserved)`);
    }
  } else {
    console.log("  \"task_schedule_sync\" already exists — skipping collection rename.");
  }

  console.log("\n=== RENAME field medicationId -> taskId ===");
  for (const coll of ["task_schedule_sync", "task_reminders"]) {
    const names = new Set((await db.listCollections().toArray()).map(c => c.name));
    if (!names.has(coll)) {
      console.log(`  ${coll}: collection doesn't exist — skipping.`);
      continue;
    }
    const r = await db.collection(coll).updateMany(
      { medicationId: { $exists: true } },
      { $rename: { medicationId: "taskId" } }
    );
    console.log(`  ${coll}: documents updated: ${r.modifiedCount}`);
  }

  await client.close();
  console.log("\nDone.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
