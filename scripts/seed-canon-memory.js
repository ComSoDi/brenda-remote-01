// scripts/seed-canon-memory.js
// One-time (idempotent) seed: upsert Brenda's real Canon Memory content from
// scripts/brenda_memories_seed.json into the `brenda_memories` collection
// (brenda-canon-memory-prd.md §8 — author-controlled, never written to by the
// app itself). Upserts by `memoryId`, so re-running to pick up edits to the
// seed file is safe.
//
// Run with: npm run seed:canon-memory

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { getDb } from "../lib/mongo.js";
import { ensureCanonMemoryIndexes, CANON_MEMORY_COLLECTION } from "../lib/canonMemory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, "brenda_memories_seed.json");

async function main() {
  const db = await getDb();
  console.log("=== SEEDING brenda_memories (real Canon Memory content) ===");

  await ensureCanonMemoryIndexes(db);

  const memories = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  if (!Array.isArray(memories) || !memories.length) {
    throw new Error(`No memories found in ${SEED_PATH}`);
  }

  const col = db.collection(CANON_MEMORY_COLLECTION);
  let inserted = 0, updated = 0;

  for (const mem of memories) {
    if (!mem.memoryId) {
      console.warn("  skipped (no memoryId):", JSON.stringify(mem).slice(0, 80));
      continue;
    }
    const res = await col.updateOne({ memoryId: mem.memoryId }, { $set: mem }, { upsert: true });
    if (res.upsertedCount > 0) { inserted++; console.log(`  inserted: ${mem.memoryId}`); }
    else { updated++; console.log(`  updated:  ${mem.memoryId}`); }
  }

  console.log(`\n${inserted} inserted, ${updated} updated, ${memories.length} total in seed file.`);
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
