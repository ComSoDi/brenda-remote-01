// scripts/backup-db.js
// Dumps every collection in the database to timestamped local JSON files
// (BSON-lossless via EJSON — preserves ObjectId, Date, etc. exactly).
// Use before any migration/seed script that touches existing data.
// Run with: npm run backup:db
//
// To restore a dump, see scripts/restore-db.js.

import { getDb } from "../lib/mongo.js";
import { EJSON } from "bson";
import fs from "fs";
import path from "path";

function timestampDir() {
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

async function main() {
  const db = await getDb();
  const dbName = db.databaseName;

  const outDir = path.join("backups", timestampDir());
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`=== BACKING UP DATABASE "${dbName}" ===`);
  console.log(`Output: ${outDir}\n`);

  const collections = await db.listCollections().toArray();

  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    const filePath = path.join(outDir, `${name}.json`);
    fs.writeFileSync(filePath, EJSON.stringify(docs, { relaxed: false }, 2));
    console.log(`  ${name}: ${docs.length} document(s) -> ${filePath}`);
  }

  console.log(`\nDone. To restore this backup:\n  npm run restore:db -- --dir=${outDir} --yes`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
