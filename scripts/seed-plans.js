// scripts/seed-plans.js
// One-time (idempotent) seed: upsert the four subscription tiers into the
// `plans` collection from lib/plans.js's PLAN_SEED_DATA.
// Run with: npm run seed:plans

import { getDb } from "../lib/mongo.js";
import { PLAN_SEED_DATA } from "../lib/plans.js";

async function main() {
  const db = await getDb();

  console.log("=== SEEDING plans COLLECTION ===");

  for (const plan of PLAN_SEED_DATA) {
    const res = await db.collection("plans").updateOne(
      { planId: plan.planId },
      { $set: plan },
      { upsert: true }
    );
    const action = res.upsertedCount > 0 ? "inserted" : "updated";
    console.log(`  ${action}: ${plan.planId}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
