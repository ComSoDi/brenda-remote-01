// scripts/cleanup-migrate.js
// One-time migration: clean anonymous users + drop obsolete collections.
// Run with: npm run migrate:cleanup

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ai_chat";

if (!uri) {
  console.error("MONGODB_URI not set — run with: npm run migrate:cleanup");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log("=== ANONYMOUS USER CLEANUP ===");

  const r1 = await db.collection("users").deleteMany({ isAnonymous: true });
  console.log(`  users deleted:                     ${r1.deletedCount}`);

  const r2 = await db.collection("conversations").deleteMany({ userId: { $regex: "^user_anonymous_" } });
  console.log(`  conversations deleted:              ${r2.deletedCount}`);

  const r3 = await db.collection("gemini_voice_usage_events").deleteMany({ userId: "user_anonymous_000001" });
  console.log(`  voice usage events deleted:        ${r3.deletedCount}`);

  const r4 = await db.collection("gemini_chat_usage_events").deleteMany({ userId: "user_anonymous_000001" });
  console.log(`  chat usage events deleted:         ${r4.deletedCount}`);

  const r5 = await db.collection("gemini_voice_usage_summary").deleteMany({ userId: "user_anonymous_000001" });
  console.log(`  voice usage summary deleted:       ${r5.deletedCount}`);

  const r6 = await db.collection("gemini_chat_usage_summary").deleteMany({ userId: "user_anonymous_000001" });
  console.log(`  chat usage summary deleted:        ${r6.deletedCount}`);

  await db.collection("counters").updateOne(
    { _id: "anonymousUserSeq" },
    { $set: { seq: 0 } },
    { upsert: true }
  );
  console.log("  anonymousUserSeq counter reset to 0");

  console.log("\n=== OBSOLETE COLLECTION DROP ===");

  const obsolete = [
    "ai_personality",
    "ai_subjects",
    "preferences",
    "voice_usage",
    "voice_usage_events",
    "voice_usage_summary",
  ];

  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

  for (const name of obsolete) {
    if (existing.has(name)) {
      await db.dropCollection(name);
      console.log(`  dropped: ${name}`);
    } else {
      console.log(`  not found (skip): ${name}`);
    }
  }

  await client.close();
  console.log("\nDone.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
