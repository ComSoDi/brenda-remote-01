// scripts/restore-db.js
// Restores a backup produced by scripts/backup-db.js. For each <collection>.json
// file in the given directory, REPLACES that collection's contents entirely
// (deletes all current documents, then inserts the backed-up ones).
//
// Destructive — requires both --dir=<path> and --yes to run.
// Run with: npm run restore:db -- --dir=backups/2026-07-18T12-00-00 --yes

import { getDb } from "../lib/mongo.js";
import { EJSON } from "bson";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const dirArg = args.find((a) => a.startsWith("--dir="))?.slice("--dir=".length);
const confirmed = args.includes("--yes");

if (!dirArg) {
  console.error("Missing --dir=<path> pointing at a backup directory from scripts/backup-db.js");
  process.exit(1);
}
if (!fs.existsSync(dirArg)) {
  console.error(`Backup directory not found: ${dirArg}`);
  process.exit(1);
}
if (!confirmed) {
  console.error("This REPLACES existing collection data. Re-run with --yes to confirm.");
  process.exit(1);
}

async function main() {
  const db = await getDb();
  const dbName = db.databaseName;

  console.log(`=== RESTORING DATABASE "${dbName}" FROM ${dirArg} ===\n`);

  const files = fs.readdirSync(dirArg).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const collectionName = file.replace(/\.json$/, "");
    const raw = fs.readFileSync(path.join(dirArg, file), "utf8");
    const docs = EJSON.parse(raw);

    const del = await db.collection(collectionName).deleteMany({});
    let insertedCount = 0;
    if (docs.length > 0) {
      const ins = await db.collection(collectionName).insertMany(docs);
      insertedCount = ins.insertedCount;
    }
    console.log(`  ${collectionName}: deleted ${del.deletedCount}, restored ${insertedCount}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
