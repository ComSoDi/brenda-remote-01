// scripts/seed-canon-memory-testdata.js
// OBVIOUSLY-FAKE test fixtures for Canon Memory local validation — NOT the
// real character-bible content (that's coming separately, see the Canon
// Memory PRD §8). Every memoryId is prefixed `test_` so it can never be
// confused with real seed data later, and is easy to find/remove.
//
//   node --env-file=.env scripts/seed-canon-memory-testdata.js            (insert)
//   node --env-file=.env scripts/seed-canon-memory-testdata.js --remove   (delete)
//
// Talk to Brenda in TALK mode and say something like "I love scuba diving on
// vacation" or "tell me about your cat" to trigger recall_memory against these.

import { getDb } from "../lib/mongo.js";
import { ensureCanonMemoryIndexes, CANON_MEMORY_COLLECTION } from "../lib/canonMemory.js";

const TEST_MEMORIES = [
  {
    memoryId: "test_canon_memory_scuba",
    category: "romantic_anecdote",
    tags: ["scuba", "diving", "caribbean", "travel", "vacation", "snorkeling"],
    elements: {
      setting: "a diving trip in the Caribbean [TEST FIXTURE — not real content]",
      people: ["a dive instructor, ridiculously charming, bad at hiding it"],
      detail: "he kept \"checking her regulator\" more than necessary",
      emotion: "playful, a little wistful",
    },
    tone: "playful",
    weight: 1,
    active: true,
  },
  {
    memoryId: "test_canon_memory_cat",
    category: "pet",
    tags: ["cat", "pet", "pets", "animal"],
    elements: {
      setting: "a stray cat that adopted her, not the other way around [TEST FIXTURE]",
      people: [],
      detail: "he only ever slept on the one chair she liked best",
      emotion: "tender, funny",
    },
    tone: "funny",
    locales: ["en-US", "en-GB"], // deliberately restricted, to test locale filtering
    weight: 1,
    active: true,
  },
];

async function main() {
  const db = await getDb();
  await ensureCanonMemoryIndexes(db);
  const col = db.collection(CANON_MEMORY_COLLECTION);
  const remove = process.argv.includes("--remove");

  if (remove) {
    const ids = TEST_MEMORIES.map((m) => m.memoryId);
    const res = await col.deleteMany({ memoryId: { $in: ids } });
    console.log(`Removed ${res.deletedCount} test fixture(s).`);
    process.exit(0);
  }

  for (const mem of TEST_MEMORIES) {
    await col.updateOne({ memoryId: mem.memoryId }, { $set: mem }, { upsert: true });
    console.log("Seeded:", mem.memoryId);
  }
  console.log(`\n${TEST_MEMORIES.length} test fixture(s) ready. Remove with --remove when done testing.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
