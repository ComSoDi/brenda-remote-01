// scripts/migrate-topup-balance.js
// One-time (idempotent) migration: split top-up Brendys out of the monthly
// plan quota into their own non-expiring balance.
//
// BEFORE: addTopUp() did `voiceQuota += topUpQuota` on the subscription doc,
//         so top-ups were indistinguishable from plan quota and were wiped at
//         the monthly rollover.
// AFTER:  `voiceQuota` / `chatQuota` hold ONLY the plan's base quota (reset
//         each period); `topUpVoiceRemaining` / `topUpChatRemaining` hold the
//         purchased balance, carried across periods.
//
// This moves any (storedQuota - planBaseQuota) excess on each subscription doc
// into the new fields and normalises the quota back to the plan base.
//
// Run with: npm run migrate:topup-balance   (safe to re-run)

import { getDb } from "../lib/mongo.js";

async function main() {
  const db = await getDb();
  console.log("=== MIGRATE top-up balance out of plan quota ===");

  const [plansArr, subs] = await Promise.all([
    db.collection("plans").find({}).toArray(),
    db.collection("subscriptions").find({}).toArray(),
  ]);
  const planById = new Map(plansArr.map((p) => [p.planId, p]));

  let updated = 0, movedVoice = 0, movedChat = 0, skippedNoPlan = 0, unchanged = 0;

  for (const sub of subs) {
    const plan = planById.get(sub.planId);
    if (!plan) {
      // Can't know the base quota — just make sure the fields exist so the
      // runtime's `|| 0` fallbacks are on solid ground.
      if (sub.topUpVoiceRemaining == null || sub.topUpChatRemaining == null) {
        await db.collection("subscriptions").updateOne(
          { _id: sub._id },
          { $set: { topUpVoiceRemaining: sub.topUpVoiceRemaining || 0, topUpChatRemaining: sub.topUpChatRemaining || 0 } },
        );
        updated++;
      }
      skippedNoPlan++;
      continue;
    }

    const baseVoice = plan.voiceQuota || 0;
    const baseChat = plan.chatQuota || 0;
    const excessVoice = Math.max((sub.voiceQuota || 0) - baseVoice, 0);
    const excessChat = Math.max((sub.chatQuota || 0) - baseChat, 0);

    const newTopUpVoice = (sub.topUpVoiceRemaining || 0) + excessVoice;
    const newTopUpChat = (sub.topUpChatRemaining || 0) + excessChat;

    const needsChange =
      (sub.voiceQuota || 0) !== baseVoice ||
      (sub.chatQuota || 0) !== baseChat ||
      sub.topUpVoiceRemaining !== newTopUpVoice ||
      sub.topUpChatRemaining !== newTopUpChat;

    if (!needsChange) { unchanged++; continue; }

    await db.collection("subscriptions").updateOne(
      { _id: sub._id },
      {
        $set: {
          voiceQuota: baseVoice,
          chatQuota: baseChat,
          topUpVoiceRemaining: newTopUpVoice,
          topUpChatRemaining: newTopUpChat,
        },
      },
    );
    updated++;
    movedVoice += excessVoice;
    movedChat += excessChat;
  }

  console.log(`\nsubscription docs scanned : ${subs.length}`);
  console.log(`updated                   : ${updated}`);
  console.log(`unchanged (already split) : ${unchanged}`);
  console.log(`skipped (plan not in DB)  : ${skippedNoPlan}`);
  console.log(`Brendys moved into top-up balance — voice: ${movedVoice.toLocaleString()}, chat: ${movedChat.toLocaleString()}`);
  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
